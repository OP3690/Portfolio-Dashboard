import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import CorporateInfo from '@/models/CorporateInfo';
import StockMaster from '@/models/StockMaster';
import { subDays, addDays, isAfter, isBefore, differenceInDays } from 'date-fns';

export const dynamic = 'force-dynamic';

// Simple in-memory cache for processed results (5 minute TTL)
interface CacheEntry {
  data: any[];
  timestamp: number;
}

const resultsCache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(days: number): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return `financial-results-${days}-${today.toISOString().split('T')[0]}`;
}

function getCachedResults(days: number): any[] | null {
  const key = getCacheKey(days);
  const entry = resultsCache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data;
  }
  if (entry) {
    resultsCache.delete(key); // Remove expired entry
  }
  return null;
}

function setCachedResults(days: number, data: any[]): void {
  const key = getCacheKey(days);
  resultsCache.set(key, {
    data,
    timestamp: Date.now(),
  });
}

/**
 * GET /api/financial-results-calendar?days=7|15|30|60
 * Get stocks with upcoming financial results in the next N days
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const daysParam = searchParams.get('days') || '30';
    const days = parseInt(daysParam);

    // Allow 30 days (default) and 365 days (to show all upcoming results)
    if (![30, 365].includes(days)) {
      return NextResponse.json(
        { success: false, error: 'Days must be 30 or 365' },
        { status: 400 }
      );
    }

    // Pagination params
    const pageParam = searchParams.get('page');
    const limitParam = searchParams.get('limit');
    const page = pageParam ? parseInt(pageParam) : 1;
    const limit = limitParam ? parseInt(limitParam) : 10;

    // Check cache first
    const cachedResults = getCachedResults(days);
    if (cachedResults !== null) {
      console.log(`📦 Using cached results for ${days} days (${cachedResults.length} stocks)`);
      
      // Only fetch prices for the current page to speed up pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedResults = cachedResults.slice(startIndex, endIndex);
      
      // Fetch prices only for the current page
      const isins = paginatedResults.map(r => r.isin);
      const StockData = (await import('@/models/StockData')).default;
      const latestPricesMap = new Map<string, number | null>();
      
      if (isins.length > 0) {
        const pricePromises = isins.map(async (isin: string) => {
          try {
            const latest: any = await StockData.findOne({ isin })
              .sort({ date: -1, _id: -1 })
              .lean();
            return { isin, price: latest?.close || null };
          } catch (error) {
            return { isin, price: null };
          }
        });
        
        const priceResults = await Promise.all(pricePromises);
        priceResults.forEach((item) => {
          latestPricesMap.set(item.isin, item.price);
        });
      }
      
      // Enhance only the current page with prices
      const enrichedResults = paginatedResults.map(result => ({
        ...result,
        currentPrice: latestPricesMap.get(result.isin) || result.currentPrice || null,
      }));
      
      const totalCount = cachedResults.length;
      const totalPages = Math.ceil(totalCount / limit);
      
      return NextResponse.json({
        success: true,
        days,
        count: totalCount,
        page,
        limit,
        totalPages,
        results: enrichedResults,
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = addDays(today, days);
    targetDate.setHours(23, 59, 59, 999);

    // Get ALL stocks from StockMaster (2000+ stocks)
    const allStocks = await StockMaster.find({ exchange: 'NSE' })
      .select('isin symbol stockName')
      .lean();

    console.log(`📊 Processing ${allStocks.length} stocks for financial results calendar...`);

    // Get all existing corporate info with financial results, announcements, corporate actions, or board meetings
    const existingCorporateInfo = await CorporateInfo.find({
      $or: [
        { financialResults: { $exists: true, $ne: [] } },
        { announcements: { $exists: true, $ne: [] } },
        { corporateActions: { $exists: true, $ne: [] } },
        { boardMeetings: { $exists: true, $ne: [] } }
      ]
    })
      .select('isin symbol stockName financialResults announcements corporateActions boardMeetings')
      .lean();

    // Create a map for quick lookup
    const corporateInfoMap = new Map();
    existingCorporateInfo.forEach((info: any) => {
      corporateInfoMap.set(info.isin, info);
    });

    // Import fetchNSECorporateData for on-demand fetching
    const { fetchNSECorporateData } = await import('@/lib/nseCorporateDataService');

    const upcomingResults: Array<{
      isin: string;
      symbol: string;
      stockName: string;
      lastQuarterEnded: Date;
      expectedDate: Date;
      daysUntil: number;
      lastTotalIncome?: number;
      lastNetProfit?: number;
      lastEPS?: number;
    }> = [];

    // Process all stocks - prioritize existing data, fetch on-demand for missing ones
    let processedCount = 0;
    let fetchedCount = 0;
    let skippedNoData = 0;
    const BATCH_SIZE = 20; // Smaller batch size to avoid rate limiting
    const MAX_ON_DEMAND_FETCHES = 100; // Limit on-demand fetches to prevent timeout

    // Helper function to check if text contains financial results keywords
    const hasFinancialResultsKeyword = (text: string): boolean => {
      const lowerText = text.toLowerCase();
      return lowerText.includes('financial result') || 
             lowerText.includes('financial results') || 
             lowerText.includes('quarterly result') || 
             lowerText.includes('quarterly results') ||
             lowerText.includes('q1') || 
             lowerText.includes('q2') || 
             lowerText.includes('q3') || 
             lowerText.includes('q4') ||
             lowerText.includes('approve the financial') ||
             lowerText.includes('consider and approve') ||
             lowerText.includes('consider the financial') ||
             lowerText.includes('period ended');
    };

    // First pass: Process stocks with existing data
    for (const stock of allStocks) {
      const existingInfo = corporateInfoMap.get(stock.isin);
      if (existingInfo) {
        let foundResult = false;
        
        // PRIORITY 1: Check board meetings for "financial results" keyword (highest priority)
        if ((existingInfo as any).boardMeetings && (existingInfo as any).boardMeetings.length > 0) {
          const boardMeetings = (existingInfo as any).boardMeetings;
          for (const meeting of boardMeetings) {
            const subject = (meeting.subject || '').toLowerCase();
            const purpose = ((meeting.purpose || '').toLowerCase());
            const meetingDate = new Date(meeting.date);
            meetingDate.setHours(0, 0, 0, 0);
            
            // Check both subject and purpose for financial results keywords
            if (hasFinancialResultsKeyword(subject) || hasFinancialResultsKeyword(purpose)) {
              if (isAfter(meetingDate, today) && isBefore(meetingDate, targetDate)) {
                const daysUntil = differenceInDays(meetingDate, today);
                
                // Try to extract quarter end date from purpose if mentioned
                let lastQuarterEnded: Date | null = null;
                const quarterEndMatch = purpose.match(/(\d{1,2}[-/]\w{3}[-/]\d{4})|(\w{3,9}\s+\d{1,2},?\s+\d{4})/i);
                if (quarterEndMatch) {
                  try {
                    lastQuarterEnded = new Date(quarterEndMatch[0]);
                  } catch (e) {
                    // If parsing fails, use null
                  }
                }
                
                // Get latest financial results if available
                let lastTotalIncome: number | undefined;
                let lastNetProfit: number | undefined;
                let lastEPS: number | undefined;
                
                if ((existingInfo as any).financialResults && (existingInfo as any).financialResults.length > 0) {
                  const financialResults = (existingInfo as any).financialResults;
                  const sortedResults = [...financialResults].sort((a: any, b: any) => {
                    const dateA = new Date(a.quarterEnded).getTime();
                    const dateB = new Date(b.quarterEnded).getTime();
                    return dateB - dateA;
                  });
                  
                  const latestFinancialResult = sortedResults[0];
                  lastTotalIncome = latestFinancialResult.totalIncome;
                  lastNetProfit = latestFinancialResult.netProfitLoss;
                  lastEPS = latestFinancialResult.earningsPerShare;
                  
                  // If we didn't extract quarter end from purpose, use the latest financial result's quarter end
                  if (!lastQuarterEnded) {
                    lastQuarterEnded = new Date(latestFinancialResult.quarterEnded);
                  }
                }
                
                upcomingResults.push({
                  isin: stock.isin,
                  symbol: stock.symbol || '',
                  stockName: stock.stockName || 'Unknown',
                  lastQuarterEnded: lastQuarterEnded || new Date(),
                  expectedDate: meetingDate,
                  daysUntil,
                  lastTotalIncome,
                  lastNetProfit,
                  lastEPS,
                });
                foundResult = true;
                break; // Use the first matching meeting date
              }
            }
          }
        }
        
        // PRIORITY 2: Check announcements for "financial results" keyword
        if (!foundResult && (existingInfo as any).announcements && (existingInfo as any).announcements.length > 0) {
          const announcements = (existingInfo as any).announcements;
          for (const announcement of announcements) {
            const subject = (announcement.subject || '').toLowerCase();
            const announcementDate = new Date(announcement.date);
            announcementDate.setHours(0, 0, 0, 0);
            
            if (hasFinancialResultsKeyword(subject) &&
                isAfter(announcementDate, today) && isBefore(announcementDate, targetDate)) {
              const daysUntil = differenceInDays(announcementDate, today);
              upcomingResults.push({
                isin: stock.isin,
                symbol: stock.symbol || '',
                stockName: stock.stockName || 'Unknown',
                lastQuarterEnded: new Date(),
                expectedDate: announcementDate,
                daysUntil,
              });
              foundResult = true;
              break;
            }
          }
        }
        
        // PRIORITY 3: Check corporate actions for "financial results" keyword
        if (!foundResult && (existingInfo as any).corporateActions && (existingInfo as any).corporateActions.length > 0) {
          const corporateActions = (existingInfo as any).corporateActions;
          for (const action of corporateActions) {
            const subject = (action.subject || '').toLowerCase();
            const actionDate = new Date(action.date);
            actionDate.setHours(0, 0, 0, 0);
            
            if (hasFinancialResultsKeyword(subject) &&
                isAfter(actionDate, today) && isBefore(actionDate, targetDate)) {
              const daysUntil = differenceInDays(actionDate, today);
              upcomingResults.push({
                isin: stock.isin,
                symbol: stock.symbol || '',
                stockName: stock.stockName || 'Unknown',
                lastQuarterEnded: new Date(),
                expectedDate: actionDate,
                daysUntil,
              });
              foundResult = true;
              break;
            }
          }
        }
        
        // PRIORITY 4: Check financial results (quarter-based estimation) - fallback
        if (!foundResult && (existingInfo as any).financialResults && (existingInfo as any).financialResults.length > 0) {
          const financialResults = (existingInfo as any).financialResults;
          const sortedResults = [...financialResults].sort((a: any, b: any) => {
            const dateA = new Date(a.quarterEnded).getTime();
            const dateB = new Date(b.quarterEnded).getTime();
            return dateB - dateA;
          });

          const lastResult = sortedResults[0];
          const lastQuarterEnded = new Date(lastResult.quarterEnded);
          const nextResultDate = estimateNextResultDate(lastQuarterEnded);

          if (isAfter(nextResultDate, today) && isBefore(nextResultDate, targetDate)) {
            const daysUntil = differenceInDays(nextResultDate, today);
            upcomingResults.push({
              isin: stock.isin,
              symbol: stock.symbol || '',
              stockName: stock.stockName || 'Unknown',
              lastQuarterEnded,
              expectedDate: nextResultDate,
              daysUntil,
              lastTotalIncome: lastResult.totalIncome,
              lastNetProfit: lastResult.netProfitLoss,
              lastEPS: lastResult.earningsPerShare,
            });
            foundResult = true;
          }
        }
        
        processedCount++;
      }
    }

    console.log(`   Processed ${processedCount} stocks with existing data, found ${upcomingResults.length} upcoming results`);

    // Second pass: Fetch on-demand for stocks without data (limited to prevent timeout)
    const stocksWithoutData = allStocks.filter((stock: any) => 
      !corporateInfoMap.has(stock.isin) && stock.symbol
    ).slice(0, MAX_ON_DEMAND_FETCHES); // Limit to prevent timeout

    console.log(`   Fetching data for ${stocksWithoutData.length} stocks without existing data...`);

    for (let i = 0; i < stocksWithoutData.length; i += BATCH_SIZE) {
      const batch = stocksWithoutData.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (stock: any) => {
        try {
          // Fetch from NSE API
          try {
            const nseData = await fetchNSECorporateData(stock.symbol);
            fetchedCount++;
            
            // Save to database for future use (non-blocking)
            CorporateInfo.findOneAndUpdate(
              { isin: stock.isin },
              {
                $set: {
                  isin: stock.isin,
                  symbol: stock.symbol,
                  stockName: stock.stockName,
                  financialResults: nseData.financialResults || [],
                  announcements: nseData.announcements || [],
                  corporateActions: nseData.corporateActions || [],
                  boardMeetings: nseData.boardMeetings || [],
                  lastUpdated: new Date(),
                }
              },
              { upsert: true }
            ).catch(() => {}); // Non-blocking
            
            // Helper function to check financial results keywords
            const hasFinancialResultsKeyword = (text: string): boolean => {
              const lowerText = text.toLowerCase();
              return lowerText.includes('financial result') || 
                     lowerText.includes('financial results') || 
                     lowerText.includes('quarterly result') || 
                     lowerText.includes('quarterly results') ||
                     lowerText.includes('q1') || 
                     lowerText.includes('q2') || 
                     lowerText.includes('q3') || 
                     lowerText.includes('q4') ||
                     lowerText.includes('approve the financial') ||
                     lowerText.includes('consider and approve') ||
                     lowerText.includes('consider the financial') ||
                     lowerText.includes('period ended');
            };
            
            // PRIORITY 1: Check board meetings for "financial results" keyword (highest priority)
            if (nseData.boardMeetings && nseData.boardMeetings.length > 0) {
              for (const meeting of nseData.boardMeetings) {
                const subject = (meeting.subject || '').toLowerCase();
                const purpose = ((meeting.purpose || '').toLowerCase());
                const meetingDate = new Date(meeting.date);
                meetingDate.setHours(0, 0, 0, 0);
                
                // Check both subject and purpose for financial results keywords
                if (hasFinancialResultsKeyword(subject) || hasFinancialResultsKeyword(purpose)) {
                  if (isAfter(meetingDate, today) && isBefore(meetingDate, targetDate)) {
                    const daysUntil = differenceInDays(meetingDate, today);
                    
                    // Try to extract quarter end date from purpose if mentioned
                    let lastQuarterEnded: Date | null = null;
                    const quarterEndMatch = purpose.match(/(\d{1,2}[-/]\w{3}[-/]\d{4})|(\w{3,9}\s+\d{1,2},?\s+\d{4})/i);
                    if (quarterEndMatch) {
                      try {
                        lastQuarterEnded = new Date(quarterEndMatch[0]);
                      } catch (e) {
                        // If parsing fails, use null
                      }
                    }
                    
                    // Get latest financial results if available
                    let lastTotalIncome: number | undefined;
                    let lastNetProfit: number | undefined;
                    let lastEPS: number | undefined;
                    
                    if (nseData.financialResults && nseData.financialResults.length > 0) {
                      const financialResults = nseData.financialResults;
                      const sortedResults = [...financialResults].sort((a: any, b: any) => {
                        const dateA = new Date(a.quarterEnded).getTime();
                        const dateB = new Date(b.quarterEnded).getTime();
                        return dateB - dateA;
                      });
                      
                      const latestFinancialResult = sortedResults[0];
                      lastTotalIncome = latestFinancialResult.totalIncome;
                      lastNetProfit = latestFinancialResult.netProfitLoss;
                      lastEPS = latestFinancialResult.earningsPerShare;
                      
                      // If we didn't extract quarter end from purpose, use the latest financial result's quarter end
                      if (!lastQuarterEnded) {
                        lastQuarterEnded = new Date(latestFinancialResult.quarterEnded);
                      }
                    }
                    
                    return {
                      isin: stock.isin,
                      symbol: stock.symbol || '',
                      stockName: stock.stockName || 'Unknown',
                      lastQuarterEnded: lastQuarterEnded || new Date(),
                      expectedDate: meetingDate,
                      daysUntil,
                      lastTotalIncome,
                      lastNetProfit,
                      lastEPS,
                    };
                  }
                }
              }
            }
            
            // PRIORITY 2: Check announcements for "financial results" keyword
            if (nseData.announcements && nseData.announcements.length > 0) {
              for (const announcement of nseData.announcements) {
                const subject = (announcement.subject || '').toLowerCase();
                const announcementDate = new Date(announcement.date);
                announcementDate.setHours(0, 0, 0, 0);
                
                if (hasFinancialResultsKeyword(subject) &&
                    isAfter(announcementDate, today) && isBefore(announcementDate, targetDate)) {
                  const daysUntil = differenceInDays(announcementDate, today);
                  return {
                    isin: stock.isin,
                    symbol: stock.symbol || '',
                    stockName: stock.stockName || 'Unknown',
                    lastQuarterEnded: new Date(),
                    expectedDate: announcementDate,
                    daysUntil,
                  };
                }
              }
            }
            
            // PRIORITY 3: Check corporate actions for "financial results" keyword
            if (nseData.corporateActions && nseData.corporateActions.length > 0) {
              for (const action of nseData.corporateActions) {
                const subject = (action.subject || '').toLowerCase();
                const actionDate = new Date(action.date);
                actionDate.setHours(0, 0, 0, 0);
                
                if (hasFinancialResultsKeyword(subject) &&
                    isAfter(actionDate, today) && isBefore(actionDate, targetDate)) {
                  const daysUntil = differenceInDays(actionDate, today);
                  return {
                    isin: stock.isin,
                    symbol: stock.symbol || '',
                    stockName: stock.stockName || 'Unknown',
                    lastQuarterEnded: new Date(),
                    expectedDate: actionDate,
                    daysUntil,
                  };
                }
              }
            }
            
            // PRIORITY 4: Check financial results (quarter-based estimation) - fallback
            if (nseData.financialResults && nseData.financialResults.length > 0) {
              const financialResults = nseData.financialResults;
              const sortedResults = [...financialResults].sort((a: any, b: any) => {
                const dateA = new Date(a.quarterEnded).getTime();
                const dateB = new Date(b.quarterEnded).getTime();
                return dateB - dateA;
              });

              const lastResult = sortedResults[0];
              const lastQuarterEnded = new Date(lastResult.quarterEnded);
              const nextResultDate = estimateNextResultDate(lastQuarterEnded);

              if (isAfter(nextResultDate, today) && isBefore(nextResultDate, targetDate)) {
                const daysUntil = differenceInDays(nextResultDate, today);
                return {
                  isin: stock.isin,
                  symbol: stock.symbol || '',
                  stockName: stock.stockName || 'Unknown',
                  lastQuarterEnded,
                  expectedDate: nextResultDate,
                  daysUntil,
                  lastTotalIncome: lastResult.totalIncome,
                  lastNetProfit: lastResult.netProfitLoss,
                  lastEPS: lastResult.earningsPerShare,
                };
              }
            }
            
            skippedNoData++;
            return null;
          } catch (error) {
            skippedNoData++;
            return null;
          }
        } catch (error) {
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      const validResults = batchResults.filter(r => r !== null) as any[];
      upcomingResults.push(...validResults);
      
      processedCount += batch.length;

      // Delay to avoid rate limiting
      if (i + BATCH_SIZE < stocksWithoutData.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    console.log(`✅ Processed ${processedCount} stocks, fetched ${fetchedCount} from API, skipped ${skippedNoData}, found ${upcomingResults.length} upcoming results`);

    // Sort by days until (soonest first)
    upcomingResults.sort((a, b) => a.daysUntil - b.daysUntil);

    // Get current prices for these stocks from StockData
    const isins = upcomingResults.map(r => r.isin);
    const StockData = (await import('@/models/StockData')).default;
    
    // Fetch latest prices for all stocks
    const latestPricesMap = new Map<string, number | null>();
    
    // Use individual queries to get latest prices efficiently (avoid memory limits)
    const PRICE_BATCH_SIZE = 100;
    for (let i = 0; i < isins.length; i += PRICE_BATCH_SIZE) {
      const batchIsins = isins.slice(i, i + PRICE_BATCH_SIZE);
      
      // Use parallel individual queries instead of aggregation to avoid memory limits
      const pricePromises = batchIsins.map(async (isin: string) => {
        try {
          const latest: any = await StockData.findOne({ isin })
            .sort({ date: -1, _id: -1 })
            .lean();
          return { isin, price: latest?.close || null };
        } catch (error) {
          return { isin, price: null };
        }
      });
      
      const priceResults = await Promise.all(pricePromises);
      priceResults.forEach((item) => {
        latestPricesMap.set(item.isin, item.price);
      });
    }

    // Helper function to calculate QnQ Growth
    const calculateQnQGrowth = (financialResults: any[]): string | null => {
      if (!financialResults || financialResults.length < 2) {
        return null;
      }
      
      // Sort by quarter end date (most recent first)
      const sortedResults = [...financialResults].sort((a: any, b: any) => {
        const dateA = new Date(a.quarterEnded).getTime();
        const dateB = new Date(b.quarterEnded).getTime();
        return dateB - dateA;
      });
      
      // Get last 4 quarters
      const last4Quarters = sortedResults.slice(0, 4);
      if (last4Quarters.length < 2) {
        return null;
      }
      
      // Calculate QnQ growth percentages (using netProfitLoss)
      const growthPercentages: number[] = [];
      
      for (let i = 0; i < last4Quarters.length - 1; i++) {
        const currentQuarter = last4Quarters[i];
        const previousQuarter = last4Quarters[i + 1];
        
        const currentProfit = currentQuarter.netProfitLoss;
        const previousProfit = previousQuarter.netProfitLoss;
        
        // Only calculate if both values are valid numbers
        if (typeof currentProfit === 'number' && typeof previousProfit === 'number' && previousProfit !== 0) {
          const growth = ((currentProfit - previousProfit) / Math.abs(previousProfit)) * 100;
          growthPercentages.push(Math.round(growth * 100) / 100); // Round to 2 decimal places
        } else if (typeof currentProfit === 'number' && typeof previousProfit === 'number' && previousProfit === 0 && currentProfit !== 0) {
          // Handle case where previous quarter had 0 profit
          growthPercentages.push(Infinity);
        } else {
          // If we can't calculate, break the chain
          break;
        }
      }
      
      if (growthPercentages.length === 0) {
        return null;
      }
      
      // Format as "15% -> 25% -> 12% -> 18%"
      return growthPercentages.map(g => {
        if (g === Infinity) return '∞';
        if (g === -Infinity) return '-∞';
        return `${g > 0 ? '+' : ''}${g.toFixed(0)}%`;
      }).join(' → ');
    };

    // Enhance results with current prices and QnQ growth
    const enrichedResults = upcomingResults.map(result => {
      // Get financial results for this stock
      const corporateInfo = corporateInfoMap.get(result.isin);
      const financialResults = corporateInfo?.financialResults || [];
      const qnqGrowth = calculateQnQGrowth(financialResults);
      
      return {
        ...result,
        currentPrice: latestPricesMap.get(result.isin) || null,
        qnqGrowth,
      };
    });

    // Cache the full results (without pagination)
    setCachedResults(days, enrichedResults);

    // Pagination - only return the requested page
    const totalCount = enrichedResults.length;
    const totalPages = Math.ceil(totalCount / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedResults = enrichedResults.slice(startIndex, endIndex);

    return NextResponse.json({
      success: true,
      days,
      count: totalCount,
      page,
      limit,
      totalPages,
      results: paginatedResults,
    });
  } catch (error: any) {
    console.error('Error in financial-results-calendar API:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Estimate next financial result announcement date based on last quarter end
 * Typically results are announced 45-60 days after quarter end
 */
function estimateNextResultDate(lastQuarterEnded: Date): Date {
  const quarterEnd = new Date(lastQuarterEnded);
  const month = quarterEnd.getMonth(); // 0-11
  
  // Add 45-60 days (average 52 days) to quarter end
  const estimatedDate = addDays(quarterEnd, 52);
  
  // Adjust to next business day if weekend
  const dayOfWeek = estimatedDate.getDay();
  if (dayOfWeek === 0) { // Sunday
    return addDays(estimatedDate, 1);
  } else if (dayOfWeek === 6) { // Saturday
    return addDays(estimatedDate, 2);
  }
  
  return estimatedDate;
}

