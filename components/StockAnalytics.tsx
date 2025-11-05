'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatCurrency } from '@/lib/utils';
import PerformanceAnalyticsCharts from './PerformanceAnalyticsCharts';
import DetailedAnalysis from './DetailedAnalysis';
import PEIntelligence from './PEIntelligence';

interface StockAnalyticsProps {
  holdings: Array<{
    stockName: string;
    marketValue: number;
    investmentAmount: number;
    profitLossTillDatePercent: number;
    profitLossTillDate: number;
  }>;
  transactions: Array<{
    isin: string;
    transactionDate: Date | string;
    buySell: string;
    tradePriceAdjusted?: number;
    tradedQty?: number;
    tradeValueAdjusted?: number;
  }>;
}

export default function StockAnalytics({ holdings, transactions }: StockAnalyticsProps) {
  // Calculate metrics
  const totalStocks = holdings.length;
  const totalCurrentValue = holdings.reduce((sum, h) => sum + (h.marketValue || 0), 0);

  // Positive and Negative Stocks
  const positiveStocks = holdings.filter(h => (h.profitLossTillDatePercent || 0) > 0);
  const negativeStocks = holdings.filter(h => (h.profitLossTillDatePercent || 0) < 0);
  const positiveCount = positiveStocks.length;
  const negativeCount = negativeStocks.length;
  const positiveCurrentValue = positiveStocks.reduce((sum, h) => sum + (h.marketValue || 0), 0);
  const negativeCurrentValue = negativeStocks.reduce((sum, h) => sum + (h.marketValue || 0), 0);

  // Dividend Yield Stocks - stocks with at least 3 dividend transactions per year
  // Check using case-insensitive string matching like in calculateMonthlyDividends
  const dividendTransactions = transactions.filter(t => {
    if (!t || !t.buySell) return false;
    const buySellUpper = (t.buySell || '').toUpperCase();
    return buySellUpper.includes('DIVIDEND') || buySellUpper === 'DIV';
  });
  
  
  // Group dividend transactions by ISIN and year
  const dividendByStockAndYear: { [key: string]: { [year: string]: number } } = {};
  dividendTransactions.forEach(t => {
    if (!t.isin) {
      return;
    }
    const date = new Date(t.transactionDate);
    if (isNaN(date.getTime())) {
      return;
    }
    const year = date.getFullYear().toString();
    
    if (!dividendByStockAndYear[t.isin]) {
      dividendByStockAndYear[t.isin] = {};
    }
    if (!dividendByStockAndYear[t.isin][year]) {
      dividendByStockAndYear[t.isin][year] = 0;
    }
    dividendByStockAndYear[t.isin][year]++;
  });
  
  // Find stocks with at least 3 dividends in any year
  const dividendStocksWith3Plus = new Set<string>();
  Object.keys(dividendByStockAndYear).forEach(isin => {
    const years = dividendByStockAndYear[isin];
    const has3PlusInYear = Object.values(years).some(count => count >= 3);
    if (has3PlusInYear) {
      dividendStocksWith3Plus.add(isin);
    }
  });
  
  const dividendCount = dividendStocksWith3Plus.size;
  
  // Calculate annual dividend payout from actual dividend transactions
  // Use all dividend transactions for the stocks that meet the 3+ threshold
  const annualDividendPayout = dividendTransactions
    .filter(t => t.isin && dividendStocksWith3Plus.has(t.isin))
    .reduce((sum, t) => {
      // Use tradeValueAdjusted if available, otherwise calculate from tradePriceAdjusted * tradedQty
      let dividendAmount = 0;
      if (t.tradeValueAdjusted && t.tradeValueAdjusted > 0) {
        dividendAmount = t.tradeValueAdjusted;
      } else if (t.tradePriceAdjusted && t.tradedQty) {
        dividendAmount = t.tradePriceAdjusted * t.tradedQty;
      }
      return sum + dividendAmount;
    }, 0);

  // Average Return per Stock - Use Weighted Average (by investment amount) to align with portfolio return
  // This ensures stocks with larger positions have more influence on the average
  const totalInvested = holdings.reduce((sum, h) => sum + (h.investmentAmount || 0), 0);
  const weightedAverageReturn = totalInvested > 0
    ? holdings.reduce((sum, h) => {
        const weight = (h.investmentAmount || 0) / totalInvested;
        const returnPercent = h.profitLossTillDatePercent || 0;
        return sum + (returnPercent * weight);
      }, 0)
    : 0;
  
  // Also calculate simple average for reference (median return uses simple average)
  const returns = holdings.map(h => h.profitLossTillDatePercent || 0);
  const simpleAverageReturn = returns.length > 0 
    ? returns.reduce((sum, r) => sum + r, 0) / returns.length 
    : 0;
  
  // Use weighted average (this better represents portfolio performance)
  const averageReturn = weightedAverageReturn;

  // Median Return
  const sortedReturns = [...returns].sort((a, b) => a - b);
  const medianReturn = sortedReturns.length > 0
    ? sortedReturns.length % 2 === 0
      ? (sortedReturns[sortedReturns.length / 2 - 1] + sortedReturns[sortedReturns.length / 2]) / 2
      : sortedReturns[Math.floor(sortedReturns.length / 2)]
    : 0;

  // Performance Spread
  // Find stocks with max and min returns (use original returns array, but log for debugging)
  const maxReturn = returns.length > 0 ? Math.max(...returns) : 0;
  const minReturn = returns.length > 0 ? Math.min(...returns) : 0;
  const spread = maxReturn - minReturn;
  
  // Find stocks with max and min returns for display
  const maxReturnStock = holdings.find(h => {
    const stockReturn = h.profitLossTillDatePercent || 0;
    return Math.abs(stockReturn - maxReturn) < 0.01;
  });
  const minReturnStock = holdings.find(h => {
    const stockReturn = h.profitLossTillDatePercent || 0;
    return Math.abs(stockReturn - minReturn) < 0.01;
  });
  
  // For debugging: log extreme returns
  if (maxReturn > 400) {
    console.warn('High return detected:', {
      maxReturn,
      stock: maxReturnStock?.stockName,
      investmentAmount: maxReturnStock?.investmentAmount,
      marketValue: maxReturnStock?.marketValue
    });
  }

  // Consistency Index (using monthly returns as proxy)
  // This is a simplified calculation - in reality would need daily returns
  const positiveReturnsCount = returns.filter(r => r > 0).length;
  const consistencyIndex = returns.length > 0 
    ? (positiveReturnsCount / returns.length) * 100 
    : 0;

  // Risk Ratio
  const positiveInvested = positiveStocks.reduce((sum, h) => sum + (h.investmentAmount || 0), 0);
  const negativeInvested = negativeStocks.reduce((sum, h) => sum + (h.investmentAmount || 0), 0);
  const riskRatio = negativeInvested > 0 ? positiveInvested / negativeInvested : 0;

  // Volatility Index (standard deviation of returns)
  const mean = averageReturn;
  const variance = returns.length > 0
    ? returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length
    : 0;
  const volatilityIndex = Math.sqrt(variance);

  // Health Score (composite metric: 0-100)
  const positiveRatio = returns.length > 0 ? (positiveCount / returns.length) * 100 : 0;
  const returnScore = Math.max(0, Math.min(100, 50 + (averageReturn * 2))); // Normalize to 0-100
  const volatilityScore = Math.max(0, Math.min(100, 100 - (volatilityIndex * 5))); // Lower volatility = higher score
  const healthScore = Math.round((positiveRatio * 0.4) + (returnScore * 0.4) + (volatilityScore * 0.2));
  const healthLabel = healthScore >= 75 ? 'Excellent' : healthScore >= 60 ? 'Healthy' : healthScore >= 45 ? 'Moderate' : 'Needs Attention';

  // Diversification Score (based on sector spread and stock count)
  const uniqueSectors = new Set(holdings.map(h => (h as any).sectorName).filter(Boolean)).size;
  const stockCountScore = Math.min(10, (totalStocks / 3)); // Max score for 30+ stocks
  const sectorScore = Math.min(10, (uniqueSectors * 2)); // Max score for 5+ sectors
  const diversificationScore = ((stockCountScore + sectorScore) / 2).toFixed(1);
  const diversificationLabel = parseFloat(diversificationScore) >= 7.5 ? 'Well diversified' : 
                               parseFloat(diversificationScore) >= 5 ? 'Moderately diversified' : 
                               'Needs diversification';

  // Format large currency values (e.g., 10L for 10,00,000)
  const formatCurrencyShort = (amount: number): string => {
    if (amount >= 10000000) {
      return `₹${(amount / 10000000).toFixed(1)}Cr`;
    } else if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(0)}L`;
    } else if (amount >= 1000) {
      return `₹${(amount / 1000).toFixed(0)}K`;
    }
    return formatCurrency(amount);
  };

  const InfoTooltip = ({ description }: { description: string }) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const tooltipIdRef = useRef(`tooltip-${Math.random().toString(36).substr(2, 9)}`);

    const updateTooltipPosition = () => {
      if (!buttonRef.current) {
        return;
      }

      const button = buttonRef.current;
      const rect = button.getBoundingClientRect();
      
      // Validate rect
      if (!rect || rect.width === 0 || rect.height === 0) {
        return;
      }

      const tooltipWidth = 288; // w-72 = 288px
      const tooltipHeight = 400; // Max estimated height
      const spacing = 8;
      const margin = 20;
      const viewportWidth = window.innerWidth || 1920;
      const viewportHeight = window.innerHeight || 1080;

      // Calculate position relative to viewport (for fixed positioning)
      let top = rect.bottom + spacing;
      let left = rect.left;
      
      // Default: try positioning to the right and below
      // Check right overflow - position to the left of button if needed
      if (left + tooltipWidth > viewportWidth - margin) {
        left = rect.right - tooltipWidth;
      }
      
      // Check left overflow - ensure minimum margin
      if (left < margin) {
        left = margin;
      }
      
      // Final check: ensure tooltip fits horizontally
      if (left + tooltipWidth > viewportWidth - margin) {
        // If still doesn't fit, position it to the left edge
        left = margin;
      }
      
      // Check bottom overflow - position above button if needed
      if (rect.bottom + tooltipHeight > viewportHeight - margin) {
        top = rect.top - tooltipHeight - spacing;
      }
      
      // Ensure top is within bounds
      if (top < margin) {
        top = margin;
      }
      
      // Final check: ensure tooltip fits vertically
      const maxAvailableHeight = viewportHeight - top - margin;
      const finalMaxHeight = Math.min(maxAvailableHeight, tooltipHeight);

      const newStyle: React.CSSProperties = {
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        zIndex: 99999,
        maxHeight: `${finalMaxHeight}px`,
        overflow: 'hidden',
        wordWrap: 'break-word',
        overflowWrap: 'break-word',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
      };

      setTooltipStyle(newStyle);
    };

    const handleMouseEnter = (e: React.MouseEvent<HTMLElement>) => {
      // Clear any pending timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      // Show tooltip first, then update position
      setShowTooltip(true);
      
      // Use requestAnimationFrame to ensure DOM is ready, then update position
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (buttonRef.current) {
            updateTooltipPosition();
          }
        });
      });
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLElement>) => {
      // Add a small delay to allow mouse movement between button and tooltip
      timeoutRef.current = setTimeout(() => {
        setShowTooltip(false);
        timeoutRef.current = null;
      }, 200);
    };

    const handleTooltipMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Clear any pending timeout when mouse enters tooltip
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setShowTooltip(true);
    };

    const handleTooltipMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setShowTooltip(false);
    };

    // Update position on scroll or resize
    useEffect(() => {
      if (showTooltip && buttonRef.current) {
        // Update position immediately when shown
        updateTooltipPosition();
        
        const updatePosition = () => {
          if (buttonRef.current) {
            updateTooltipPosition();
          }
        };
        window.addEventListener('scroll', updatePosition, true);
        window.addEventListener('resize', updatePosition);
        return () => {
          window.removeEventListener('scroll', updatePosition, true);
          window.removeEventListener('resize', updatePosition);
        };
      }
    }, [showTooltip]);

    // Default fallback style if positioning fails
    const defaultTooltipStyle: React.CSSProperties = {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 99999,
    };

    const tooltipContent = showTooltip ? (
      <div 
        key={tooltipIdRef.current}
        ref={tooltipRef}
        id={tooltipIdRef.current}
        className="w-72 max-w-[85vw] text-xs bg-gradient-to-br from-white via-gray-50 to-blue-50/30 border border-gray-200/80 rounded-2xl shadow-2xl backdrop-blur-sm relative"
        style={{ 
          ...(Object.keys(tooltipStyle).length > 0 ? tooltipStyle : defaultTooltipStyle),
          textTransform: 'none', 
          fontVariant: 'normal',
          textRendering: 'optimizeLegibility',
          pointerEvents: 'auto',
          overflow: 'hidden',
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
          maxWidth: '288px',
          animation: 'tooltipFadeIn 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(59, 130, 246, 0.15)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
        onMouseEnter={handleTooltipMouseEnter}
        onMouseLeave={handleTooltipMouseLeave}
      >
            {/* Tooltip Arrow - Beautiful pointer */}
            {buttonRef.current && (
              <div
                className="absolute"
                style={{
                  top: '-8px',
                  left: buttonRef.current ? `${Math.min(20, 240)}px` : '20px',
                  width: 0,
                  height: 0,
                  borderLeft: '8px solid transparent',
                  borderRight: '8px solid transparent',
                  borderBottom: '8px solid rgba(255, 255, 255, 0.98)',
                  filter: 'drop-shadow(0 -2px 4px rgba(0, 0, 0, 0.1))',
                  zIndex: 100000,
                }}
              />
            )}
            <div className="p-5 space-y-3 bg-gradient-to-b from-transparent to-transparent rounded-2xl" style={{ 
              textTransform: 'none',
              wordWrap: 'break-word',
              overflowWrap: 'break-word',
              overflowX: 'hidden',
              overflowY: 'auto',
              flex: '1 1 auto',
              minHeight: 0,
              boxSizing: 'border-box',
            }}>
              {description.replace(/\\n/g, '\n').split('\n').map((line, index) => {
                const trimmedLine = line.trim();
                if (!trimmedLine) return null;
                
                // Check if line is a section header (ends with colon)
                const isSectionHeader = trimmedLine.endsWith(':');
                // Check if line is a bullet point
                const isBullet = trimmedLine.startsWith('•') || trimmedLine.startsWith('-');
                // Check if line is a formula
                const isFormula = trimmedLine.includes('=') || trimmedLine.includes('×') || 
                  trimmedLine.includes('√') || trimmedLine.includes('Σ') || trimmedLine.includes('÷');
                
                if (isSectionHeader) {
                  // Convert section headers like "WHAT IT MEANS:" to "What It Means:"
                  const headerText = trimmedLine.slice(0, -1).trim(); // Remove colon
                  const words = headerText.toLowerCase().split(' ');
                  const formattedHeader = words
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ') + ':';
                  return (
                    <div 
                      key={index} 
                      className="font-bold text-gray-800 text-sm mt-4 first:mt-0 pt-3 border-t border-gray-200 first:border-t-0 first:pt-0 tracking-wide"
                      style={{ 
                        textTransform: 'none',
                        color: '#1e40af',
                        fontWeight: 700,
                      }}
                    >
                      {formattedHeader}
                    </div>
                  );
                } else if (isBullet) {
                  const bulletText = trimmedLine.replace(/^[•\-]\s*/, '');
                  return (
                    <div key={index} className="pl-0 flex items-start gap-3 group" style={{ 
                      textTransform: 'none',
                      wordWrap: 'break-word',
                      overflowWrap: 'break-word',
                    }}>
                      <span className="text-blue-500 mt-0.5 flex-shrink-0 font-bold text-base leading-none">•</span>
                      <span className="flex-1 leading-relaxed text-gray-700 break-words group-hover:text-gray-900 transition-colors">{bulletText}</span>
                    </div>
                  );
                } else if (isFormula) {
                  return (
                    <div 
                      key={index} 
                      className="font-mono text-xs text-blue-700 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200 my-1.5 shadow-sm"
                      style={{ 
                        textTransform: 'none',
                        backgroundColor: '#eff6ff',
                        borderColor: '#bfdbfe',
                      }}
                    >
                      {trimmedLine}
                    </div>
                  );
                } else {
                  return (
                    <div 
                      key={index} 
                      className="leading-relaxed text-gray-600 break-words"
                      style={{ 
                        textTransform: 'none',
                        wordWrap: 'break-word',
                        overflowWrap: 'break-word',
                        fontSize: '0.875rem',
                      }}
                    >
                      {trimmedLine}
                    </div>
                  );
                }
              })}
            </div>
          </div>
    ) : null;

    return (
      <>
        <button
          ref={buttonRef}
          type="button"
          className="inline-flex items-center justify-center w-4 h-4 ml-1.5 text-gray-400 hover:text-blue-600 transition-colors cursor-help focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleMouseEnter(e);
          }}
        >
          <svg
            className="w-4 h-4"
            fill="currentColor"
            viewBox="0 0 20 20"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        {typeof window !== 'undefined' && showTooltip && tooltipContent && createPortal(tooltipContent, document.body)}
      </>
    );
  };

  const StatCard = ({ 
    title, 
    value, 
    subtitle, 
    valueColor = 'text-gray-900',
    infoDescription
  }: { 
    title: string; 
    value: string | number; 
    subtitle?: string;
    valueColor?: string;
    infoDescription?: string;
  }) => (
    <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200 hover:shadow-md transition-shadow overflow-visible relative">
      <h3 className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide flex items-center overflow-visible relative z-10">
        <span className="uppercase">{title}</span>
        {infoDescription && <InfoTooltip description={infoDescription} />}
      </h3>
      <div className={`text-xl font-bold ${valueColor} mb-1`}>
        {value}
      </div>
      {subtitle && (
        <div className="text-xs text-gray-600 mt-1">{subtitle}</div>
      )}
    </div>
  );

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
      <div className="w-1 h-5 bg-blue-600 rounded"></div>
      {children}
    </h3>
  );

  return (
    <div className="container mx-auto px-4 py-6">
      
      {/* Portfolio Overview Section */}
      <div className="mb-6">
        <SectionTitle>Portfolio Overview</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 overflow-visible">
          {/* No. of Stocks */}
          <StatCard
            title="No. of Stocks"
            value={totalStocks}
            subtitle={formatCurrency(totalCurrentValue)}
            infoDescription="WHAT IT MEANS:\nTotal number of unique stocks in your portfolio and their combined current market value.\n\nREPRESENTS:\nThe breadth of your investment holdings across different companies."
          />

          {/* Positive Stocks */}
          <StatCard
            title="Positive Stocks"
            value={positiveCount}
            subtitle={formatCurrency(positiveCurrentValue)}
            valueColor="text-green-600"
            infoDescription="WHAT IT MEANS:\nNumber of stocks with positive returns (profit) and their combined current market value.\n\nCALCULATION:\nCounts all stocks where Profit/Loss Percentage > 0%"
          />

          {/* Negative Stocks */}
          <StatCard
            title="Negative Stocks"
            value={negativeCount}
            subtitle={formatCurrency(negativeCurrentValue)}
            valueColor="text-red-600"
            infoDescription="WHAT IT MEANS:\nNumber of stocks with negative returns (loss) and their combined current market value.\n\nCALCULATION:\nCounts all stocks where Profit/Loss Percentage < 0%"
          />

          {/* Dividend Yield Stocks */}
          <StatCard
            title="Dividend Yield Stocks"
            value={dividendCount}
            subtitle={formatCurrency(annualDividendPayout)}
            infoDescription="WHAT IT MEANS:\nStocks that have provided dividends at least 3 times in any calendar year.\n\nCALCULATION:\n• Identifies stocks with 3+ dividend transactions in a single year\n• Shows count of qualifying stocks\n• Displays total annual dividend payout from actual transactions"
          />

          {/* Health Score */}
          <StatCard
            title="Health Score"
            value={`${healthScore} / 100`}
            subtitle={`(${healthLabel})`}
            valueColor={healthScore >= 75 ? 'text-green-600' : healthScore >= 60 ? 'text-blue-600' : healthScore >= 45 ? 'text-yellow-600' : 'text-red-600'}
            infoDescription={`WHAT IT MEANS:\nComposite metric (0-100) combining multiple portfolio health factors into a single score.\n\nCALCULATION BREAKDOWN:\n• Positive Ratio (40% weight): Percentage of stocks with positive returns\n• Return Score (40% weight): Normalized average return performance\n• Volatility Score (20% weight): Lower volatility = higher score\n\nYOUR CURRENT VALUES:\n• Positive Ratio: ${positiveRatio.toFixed(1)}%\n• Return Score: ${returnScore.toFixed(1)}/100\n• Volatility Score: ${volatilityScore.toFixed(1)}/100\n• Final Score: ${healthScore}/100`}
          />

          {/* Diversification Score */}
          <StatCard
            title="Diversification Score"
            value={`${diversificationScore} / 10`}
            subtitle={`(${diversificationLabel})`}
            valueColor={parseFloat(diversificationScore) >= 7.5 ? 'text-green-600' : parseFloat(diversificationScore) >= 5 ? 'text-blue-600' : 'text-red-600'}
            infoDescription={`WHAT IT MEANS:\nMeasures how well your portfolio is diversified across different stocks and sectors.\n\nCALCULATION FACTORS:\n• Stock Count: ${totalStocks} stocks (max score at 30+ stocks)\n• Sector Spread: ${uniqueSectors} unique sectors (max score at 5+ sectors)\n\nFORMULA:\nScore = (Stock Count Score + Sector Score) ÷ 2\n\nYOUR BREAKDOWN:\n• Stock Count Score: ${stockCountScore.toFixed(1)}/10\n• Sector Score: ${sectorScore.toFixed(1)}/10\n• Final Score: (${stockCountScore.toFixed(1)} + ${sectorScore.toFixed(1)}) ÷ 2 = ${diversificationScore}/10`}
          />
        </div>
      </div>

      {/* Performance Metrics Section */}
      <div className="mb-6">
        <SectionTitle>Performance Metrics</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 overflow-visible">
          {/* Average Return per Stock */}
          <StatCard
            title="Average Return"
            value={`${averageReturn >= 0 ? '+' : ''}${averageReturn.toFixed(1)}%`}
            valueColor={averageReturn >= 0 ? 'text-green-600' : 'text-red-600'}
            infoDescription={`WHAT IT MEANS:\nWeighted average return percentage across all stocks, weighted by investment amount. This better reflects your actual portfolio performance since larger positions have more influence.\n\nCALCULATION:\nWeighted Average = Σ(Return × Investment Weight) for each stock\n• Investment Weight = Stock's Investment Amount ÷ Total Investment\n\nYOUR VALUES:\n• Total Stocks: ${totalStocks}\n• Total Invested: ₹${formatCurrency(totalInvested)}\n• Weighted Average Return: ${averageReturn.toFixed(1)}%\n• Simple Average (unweighted): ${simpleAverageReturn.toFixed(1)}%\n\nNOTE: This weighted average aligns closer to your portfolio's overall return than a simple average would.`}
          />

          {/* Median Return */}
          <StatCard
            title="Median Return"
            value={`${medianReturn >= 0 ? '+' : ''}${medianReturn.toFixed(1)}%`}
            valueColor={medianReturn >= 0 ? 'text-green-600' : 'text-red-600'}
            infoDescription={`WHAT IT MEANS:\nMiddle value when all stock returns are sorted in ascending order. Each stock counts equally (unweighted), unlike the weighted Average Return.\n\nWHY IT MATTERS:\n• Less sensitive to outliers and extreme values\n• Shows the "typical" stock performance regardless of position size\n• Useful when you have many small positions with good returns but a few large positions with lower returns\n\nYOUR VALUES:\n• Median: ${medianReturn.toFixed(1)}% (unweighted - each stock = 1 vote)\n• Average: ${averageReturn.toFixed(1)}% (weighted - by investment size)\n\nNOTE: Median > Average suggests most stocks perform well, but some larger positions may have lower returns, pulling the weighted average down.`}
          />

          {/* Performance Spread */}
          <StatCard
            title="Performance Spread"
            value={`${maxReturn >= 0 ? '+' : ''}${maxReturn.toFixed(1)}% / ${minReturn >= 0 ? '+' : ''}${minReturn.toFixed(1)}%`}
            subtitle={`${spread.toFixed(1)}% spread`}
            infoDescription={`WHAT IT MEANS:\nShows the difference between the top gainer and top loser, providing insight into portfolio volatility.\n\nCURRENT VALUES:\n• Best Performer: ${maxReturn >= 0 ? '+' : ''}${maxReturn.toFixed(1)}%${maxReturnStock ? ` (${maxReturnStock.stockName})` : ''}\n• Worst Performer: ${minReturn >= 0 ? '+' : ''}${minReturn.toFixed(1)}%${minReturnStock ? ` (${minReturnStock.stockName})` : ''}\n• Spread: ${spread.toFixed(1)}%\n\nNOTE: If the max return seems unrealistic (e.g., >400%), it might be a stock with a very small investment amount that had large gains, causing an inflated percentage. Check the stock name above to verify.`}
          />

          {/* Consistency Index */}
          <StatCard
            title="Consistency Index"
            value={`${consistencyIndex.toFixed(0)}%`}
            infoDescription={`WHAT IT MEANS:\nRatio of positive-return stocks to total stocks, representing performance consistency.\n\nCALCULATION:\n• Positive Stocks: ${positiveReturnsCount}\n• Total Stocks: ${returns.length}\n• Formula: (Positive Stocks ÷ Total Stocks) × 100\n• Result: ${consistencyIndex.toFixed(0)}%\n\nINTERPRETATION:\nHigher percentage indicates more consistent positive performance across your portfolio.`}
          />

          {/* Volatility Index */}
          <StatCard
            title="Volatility Index"
            value={`${volatilityIndex.toFixed(1)}%`}
            infoDescription={`WHAT IT MEANS:\nStandard deviation of stock returns, measuring how much returns vary from the average. Acts as a proxy for portfolio risk.\n\nCALCULATION:\nFormula: √(Σ(Return - Mean)² ÷ N)\n• Mean Return: ${averageReturn.toFixed(1)}%\n• Volatility Index: ${volatilityIndex.toFixed(1)}%\n\nINTERPRETATION:\nHigher volatility = Greater risk and price fluctuations\nLower volatility = More stable and predictable returns`}
          />

          {/* Risk Ratio */}
          <StatCard
            title="Risk Ratio"
            value={`${riskRatio.toFixed(1)} : 1`}
            subtitle={`${formatCurrencyShort(positiveInvested)} vs ${formatCurrencyShort(negativeInvested)}`}
            infoDescription={`WHAT IT MEANS:\nCompares total invested amount in positive-performing stocks versus negative-performing stocks.\n\nCURRENT VALUES:\n• Positive Stocks Invested: ${formatCurrency(positiveInvested)}\n• Negative Stocks Invested: ${formatCurrency(negativeInvested)}\n• Ratio: ${riskRatio.toFixed(1)} : 1\n\nINTERPRETATION:\nHigher ratio (e.g., 3:1 or more) indicates better risk distribution with more capital in profitable positions.`}
          />
        </div>
      </div>

      {/* Performance Analytics Charts */}
      <div className="mb-6">
        <SectionTitle>Performance Analytics & Trend Detection</SectionTitle>
        <PerformanceAnalyticsCharts clientId="994826" holdings={holdings} transactions={transactions} />
      </div>

      {/* PE Intelligence Section */}
      <div className="mb-6">
        <SectionTitle>PE Intelligence & Analytics</SectionTitle>
        <PEIntelligence clientId="994826" />
      </div>

      {/* Detailed Analysis Section */}
      <div className="mb-6">
        <SectionTitle>Detailed Analysis</SectionTitle>
        <DetailedAnalysis holdings={holdings} />
      </div>
    </div>
  );
}

