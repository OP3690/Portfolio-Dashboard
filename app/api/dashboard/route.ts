import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Holding from '@/models/Holding';
import Transaction from '@/models/Transaction';
import RealizedProfitLoss from '@/models/RealizedProfitLoss';
// Import StockData dynamically to avoid potential circular dependencies
// import StockData from '@/models/StockData';
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths, parseISO, subYears, startOfYear } from 'date-fns';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// Helper function to normalize ISIN (trim and uppercase) - defined at module level for reuse
const normalizeIsin = (isin: string | null | undefined): string => {
  if (!isin) return '';
  return isin.trim().toUpperCase();
};

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  try {
    console.log('API: Starting dashboard GET request...');
    console.log('API: Request URL:', request.url);
    
    // Add timeout to database connection with retry logic for stale connections
    let dbConnected = false;
    let dbError: any = null;
    for (let retry = 0; retry < 2; retry++) {
      try {
        console.log(`API: Attempting database connection (attempt ${retry + 1}/2)...`);
        const connectPromise = connectDB();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database connection timeout')), 15000)
        );
        
        await Promise.race([connectPromise, timeoutPromise]);
        console.log('API: Database connected successfully');
        dbConnected = true;
        break;
      } catch (error: any) {
        dbError = error;
        console.error(`API: Database connection attempt ${retry + 1} failed:`, error?.message);
        
        // If it's a stale connection error, wait and retry
        if (error?.message?.includes('stale') || error?.message?.includes('electionId')) {
          console.log('API: Stale connection detected, will retry...');
          if (retry < 1) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
            continue;
          }
        }
      }
    }
    
    if (!dbConnected && dbError) {
      console.error('API: Database connection failed after retries:', dbError);
      console.error('API: Database error stack:', dbError?.stack);
      return NextResponse.json(
        { 
          error: `Database connection failed: ${dbError.message}`,
          details: process.env.NODE_ENV === 'development' ? dbError?.stack : undefined
        },
        { status: 500 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const clientId = searchParams.get('clientId') || '994826'; // Default client ID
    console.log(`API: Client ID: ${clientId}`);

    // Get all holdings
    console.log('API: Fetching holdings...');
    let holdings: any[] = [];
    
    try {
      holdings = await Holding.find({ clientId }).lean();
      console.log(`API: 📊 Fetched ${holdings.length} holdings from database`);
      
      // Normalize ISINs to handle whitespace/case issues
      holdings = holdings.map((h: any) => ({
        ...h,
        isin: normalizeIsin(h.isin),
      }));
    } catch (holdingsError: any) {
      console.error('API: Error fetching holdings:', holdingsError);
      console.error('API: Holdings error stack:', holdingsError?.stack);
      return NextResponse.json(
        { 
          error: `Failed to fetch holdings: ${holdingsError.message}`,
          details: process.env.NODE_ENV === 'development' ? holdingsError?.stack : undefined
        },
        { status: 500 }
      );
    }
    
    // OPTIMIZATION: Fetch ALL latest prices in parallel using Promise.all - MUCH faster!
    console.log('API: Fetching latest prices for all holdings (prioritizing today\'s date)...');
    const StockData = (await import('@/models/StockData')).default;
    
    // Get unique ISINs from holdings
    const uniqueIsins = [...new Set(holdings.map((h: any) => h.isin).filter(Boolean))];
    
    // Use aggregation pipeline to get latest price for each ISIN in ONE query (fastest)
    // CRITICAL: Prioritize today's date, then fall back to latest available
    const latestPricesMap = new Map<string, number>();
    const latestDatesMap = new Map<string, Date>(); // Track dates for debugging
    
    // Get today's date range (start and end of today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    
    try {
      // TWO-PASS APPROACH: First get today's prices, then fill gaps with latest available
      // Step 1: Get today's prices
      const todayPrices = await StockData.aggregate([
        { 
          $match: { 
            isin: { $in: uniqueIsins },
            date: { $gte: today, $lte: todayEnd }
          } 
        },
        { $sort: { date: -1 } },
        {
          $group: {
            _id: '$isin',
            latestDate: { $first: '$date' },
            latestPrice: { $first: '$close' },
          }
        }
      ]).exec();
      
      // Step 2: Get latest prices for ISINs that don't have today's data
      const isinsWithToday = new Set(todayPrices.map((p: any) => p._id));
      const isinsNeedingLatest = uniqueIsins.filter(isin => !isinsWithToday.has(isin));
      
      let latestPrices: any[] = [];
      if (isinsNeedingLatest.length > 0) {
        latestPrices = await StockData.aggregate([
          { $match: { isin: { $in: isinsNeedingLatest } } },
          { $sort: { date: -1 } },
          {
            $group: {
              _id: '$isin',
              latestDate: { $first: '$date' },
              latestPrice: { $first: '$close' },
            }
          }
        ]).exec();
      }
      
      // Combine today's prices with latest prices (today takes precedence)
      const allPrices = [...todayPrices, ...latestPrices];
      
      // Build map for fast lookup and track dates (today's prices take precedence)
      let todayCount = 0;
      let staleCount = 0;
      
      allPrices.forEach((item: any) => {
        if (item.latestPrice && item.latestPrice > 0) {
          // Only set if not already set (today's prices were added first, so they win)
          if (!latestPricesMap.has(item._id)) {
            latestPricesMap.set(item._id, item.latestPrice);
            const priceDate = new Date(item.latestDate);
            priceDate.setHours(0, 0, 0, 0);
            latestDatesMap.set(item._id, priceDate);
            
            // Check if this is today's price
            if (priceDate.getTime() === today.getTime()) {
              todayCount++;
            } else {
              // Check if price is stale (more than 1 day old)
              const daysDiff = Math.floor((today.getTime() - priceDate.getTime()) / (1000 * 60 * 60 * 24));
              if (daysDiff > 1) {
                staleCount++;
              }
            }
          }
        }
      });
      
      console.log(`API: ✅ Fetched prices for ${latestPricesMap.size} holdings: ${todayCount} from today, ${latestPricesMap.size - todayCount} from earlier dates`);
      
      if (todayCount < uniqueIsins.length) {
        console.log(`API: ⚠️  Warning: ${uniqueIsins.length - todayCount} holdings don't have today's price. Run "Refresh Stock Data" to get latest prices.`);
      }
      
      if (staleCount > 0) {
        console.log(`API: ⚠️  Warning: ${staleCount} holdings have prices older than yesterday.`);
      }
    } catch (aggregateError) {
      console.warn('API: Aggregate query failed, falling back to parallel Promise.all...', aggregateError);
      
      // Fallback: Parallel Promise.all (still much faster than sequential)
      const pricePromises = uniqueIsins.map(async (isin) => {
        try {
          const latestData: any = await StockData.findOne({ isin })
            .sort({ date: -1 })
            .lean();
          
          if (latestData && latestData.close && latestData.close > 0) {
            return { isin, price: latestData.close };
          }
          return { isin, price: null };
        } catch (error) {
          console.error(`Error fetching price for ${isin}:`, error);
          return { isin, price: null };
        }
      });
      
      const priceResults = await Promise.all(pricePromises);
      priceResults.forEach(({ isin, price }) => {
        if (price && price > 0) {
          latestPricesMap.set(isin, price);
        }
      });
      
      console.log(`API: ✅ Fetched latest prices for ${latestPricesMap.size} holdings via parallel queries`);
    }
    
    // Update all holdings with prices from the map (very fast)
    // Note: 'today' is already defined above (line 347)
    let updatedCount = 0;
    
    for (let i = 0; i < holdings.length; i++) {
      const holding = holdings[i] as any;
      if (!holding.isin) continue;
      
      const currentPrice = latestPricesMap.get(holding.isin);
      const priceDate = latestDatesMap.get(holding.isin);
      
      if (currentPrice && currentPrice > 0) {
        const currentMarketValue = (holding.openQty || 0) * currentPrice;
        
        // Update holding with current price and market value
        holding.marketPrice = currentPrice;
        holding.marketValue = currentMarketValue;
        
        // Add metadata about price date for debugging
        if (priceDate) {
          const daysDiff = Math.floor((today.getTime() - priceDate.getTime()) / (1000 * 60 * 60 * 24));
          holding._priceDate = priceDate; // Include for debugging
          holding._priceDaysOld = daysDiff; // Days since last price update
          
          // Log if Black Box price is stale for debugging
          if (holding.stockName?.toLowerCase().includes('black box') || holding.isin === 'INE676A01027') {
            console.log(`API: 🔍 Black Box price: ₹${currentPrice} from ${priceDate.toISOString().split('T')[0]} (${daysDiff} days old)`);
          }
        }
        
        // Recalculate profit/loss with updated market value
        const investmentAmount = holding.investmentAmount || 0;
        holding.profitLossTillDate = currentMarketValue - investmentAmount;
        holding.profitLossTillDatePercent = investmentAmount > 0 
          ? ((currentMarketValue - investmentAmount) / investmentAmount) * 100 
          : 0;
        
        updatedCount++;
      } else {
        // No StockData found - keep Excel values but ensure marketPrice and marketValue exist
        if (!holding.marketPrice && holding.avgCost) {
          holding.marketPrice = holding.avgCost; // Fallback to avg cost if no market price
        }
        if (!holding.marketValue && holding.marketPrice && holding.openQty) {
          holding.marketValue = holding.marketPrice * holding.openQty;
        }
      }
    }
    
    console.log(`API: ✅ Updated ${updatedCount}/${holdings.length} holdings with latest prices`);
    
    // Ensure no holdings are filtered out - log all holdings for debugging
      console.log(`API: Holdings summary:`);
      holdings.forEach((h: any, idx: number) => {
        console.log(`  ${idx + 1}. ${h.stockName} (${h.isin}) - Qty: ${h.openQty}, Value: ${h.marketValue || 'N/A'}`);
      });
    
    // Get all transactions
    console.log('API: Fetching transactions...');
    const transactions = await Transaction.find({ clientId })
      .sort({ transactionDate: 1 })
      .lean();
    console.log(`API: Fetched ${transactions.length} transactions`);

    // Get all realized P&L
    console.log('API: Fetching realized P&L...');
    const realizedPL = await RealizedProfitLoss.find({ clientId }).lean();
    console.log(`API: Fetched ${realizedPL.length} realized P&L records`);
    
    // Check for Ola Electric in realizedPL collection
    const olaInRealizedPLCollection = realizedPL.filter((r: any) => 
      String(r.stockName || '').toLowerCase().includes('ola electric')
    );
    console.log(`API: 🔍 Ola Electric in RealizedProfitLoss collection: ${olaInRealizedPLCollection.length} records`);
    if (olaInRealizedPLCollection.length > 0) {
      olaInRealizedPLCollection.slice(0, 3).forEach((r: any, i: number) => {
        console.log(`API:   ${i + 1}. "${r.stockName}" - ISIN: ${r.isin || 'MISSING'}, Closed Qty: ${r.closedQty}, Realized PL: ${r.realizedProfitLoss}`);
      });
    } else {
      console.warn(`API: ⚠️  No Ola Electric records found in RealizedProfitLoss collection!`);
    }

  // Calculate summary metrics
  const currentValue = holdings.reduce((sum, h) => sum + (h.marketValue || 0), 0);
  const totalInvested = holdings.reduce((sum, h) => sum + (h.investmentAmount || 0), 0);
  const totalProfitLoss = holdings.reduce((sum, h) => sum + (h.profitLossTillDate || 0), 0);
  const totalRealizedPL = realizedPL.reduce((sum, r) => sum + (r.realizedProfitLoss || 0), 0);
  
  // Calculate total invested across all transactions (including sold positions)
  const totalInvestedAll = transactions
    .filter(t => t.buySell === 'BUY')
    .reduce((sum, t) => {
      const tradeValue = t.tradeValueAdjusted || (t.tradePriceAdjusted || 0) * (t.tradedQty || 0) + (t.charges || 0);
      return sum + tradeValue;
    }, 0);
  
  // Calculate total withdrawn from sales
  const totalWithdrawn = transactions
    .filter(t => t.buySell === 'SELL')
    .reduce((sum, t) => {
      const tradeValue = t.tradeValueAdjusted || (t.tradePriceAdjusted || 0) * (t.tradedQty || 0) - (t.charges || 0);
      return sum + tradeValue;
    }, 0);

    // Top 3 High Performing Stocks
    const topPerformers = [...holdings]
      .sort((a, b) => (b.profitLossTillDatePercent || 0) - (a.profitLossTillDatePercent || 0))
      .slice(0, 3)
      .map(h => ({
        stockName: h.stockName,
        isin: h.isin,
        profitLossPercent: h.profitLossTillDatePercent,
        profitLoss: h.profitLossTillDate,
        marketValue: h.marketValue,
      }));

    // Top 3 Worst Performing Stocks
    const worstPerformers = [...holdings]
      .sort((a, b) => (a.profitLossTillDatePercent || 0) - (b.profitLossTillDatePercent || 0))
      .slice(0, 3)
      .map(h => ({
        stockName: h.stockName,
        isin: h.isin,
        profitLossPercent: h.profitLossTillDatePercent,
        profitLoss: h.profitLossTillDate,
        marketValue: h.marketValue,
      }));

    // Calculate XIRR (Simplified calculation - approximate)
    let xirrData = 0;
    try {
      xirrData = calculateXIRR(transactions, holdings, realizedPL);
    } catch (error: any) {
      console.error('Error calculating XIRR:', error);
      xirrData = 0;
    }
    
    // Month on month investments
    let monthlyInvestments: Array<{month: string, investments: number, withdrawals: number, investmentDetails: any[], withdrawalDetails: any[]}> = [];
    try {
      monthlyInvestments = calculateMonthlyInvestments(transactions);
    } catch (error: any) {
      console.error('Error calculating monthly investments:', error);
      monthlyInvestments = [];
    }
    
    // Month on month dividends
    let monthlyDividends: Array<{month: string, amount: number, stockDetails: any[]}> = [];
    try {
      monthlyDividends = calculateMonthlyDividends(transactions);
    } catch (error: any) {
      console.error('Error calculating monthly dividends:', error);
      monthlyDividends = [];
    }
    
    // Month on month returns (based on actual stock prices)
    // Wrap in try-catch with timeout to prevent blocking
    // Increased timeout for Vercel (serverless can be slower)
    let monthlyReturns: Array<{month: string, returnPercent: number, returnAmount: number}> = [];
    try {
      console.log('🔄 Starting monthly returns calculation...');
      const monthlyReturnsPromise = calculateMonthlyReturns(holdings, transactions);
      const timeoutPromise = new Promise<Array<{month: string, returnPercent: number, returnAmount: number}>>((resolve) => {
        setTimeout(() => {
          console.warn('⚠️ Monthly returns calculation timed out after 60 seconds - returning empty array');
          resolve([]);
        }, 60000); // Increased to 60 seconds for Vercel
      });
      monthlyReturns = await Promise.race([monthlyReturnsPromise, timeoutPromise]);
      console.log(`✅ Monthly returns calculated: ${monthlyReturns.length} months of data`);
      if (monthlyReturns.length === 0) {
        console.warn('⚠️ No monthly returns data calculated. Check if StockData collection has historical data.');
      }
    } catch (error: any) {
      console.error('❌ Error calculating monthly returns:', error);
      console.error('Error stack:', error?.stack);
      monthlyReturns = [];
    }
    
    // Calculate return statistics
    let returnStatistics = {
      xirr: 0,
      cagr: 0,
      avgReturnOverall: { percent: 0, amount: 0 },
      avgReturnCurrentYear: { percent: 0, amount: 0 },
      bestMonthCurrentYear: { month: '', percent: 0, amount: 0 },
      worstMonthCurrentYear: { month: '', percent: 0, amount: 0 },
    };
    try {
      returnStatistics = calculateReturnStatistics(monthlyReturns, transactions, holdings, currentValue, totalInvested);
    } catch (error: any) {
      console.error('Error calculating return statistics:', error);
    }
    
    // Industry distribution
    let industryDistribution: Array<any> = [];
    try {
      industryDistribution = calculateIndustryDistribution(holdings, transactions, monthlyReturns);
    } catch (error: any) {
      console.error('Error calculating industry distribution:', error);
      industryDistribution = [];
    }
    
    // Calculate realized stocks - PRIMARY: Use RealizedProfitLoss collection (source of truth from Excel)
    // FALLBACK: Calculate from transactions if RealizedProfitLoss is empty
    let realizedStocks: any[] = [];
    try {
      console.log(`API: 📊 Calculating realized stocks from RealizedProfitLoss collection (${realizedPL.length} records)`);
      
      // Check for Ola Electric in realizedPL records
      const olaInPL = realizedPL.filter((r: any) => 
        String(r.stockName || '').toLowerCase().includes('ola electric')
      );
      if (olaInPL.length > 0) {
        console.log(`API: 🔍 Found ${olaInPL.length} Ola Electric records in RealizedProfitLoss collection:`, 
          olaInPL.map((r: any) => ({
            stockName: r.stockName,
            isin: r.isin || 'MISSING',
            closedQty: r.closedQty,
          }))
        );
      } else {
        console.warn(`API: ⚠️  No Ola Electric records found in RealizedProfitLoss collection!`);
      }
      
      // PRIMARY METHOD: Use RealizedProfitLoss collection (aggregated by stock)
      const realizedStocksFromPL = await calculateRealizedStocksFromPL(realizedPL, holdings);
      console.log(`API: ✅ Calculated ${realizedStocksFromPL.length} realized stocks from RealizedProfitLoss collection`);
      
      // FALLBACK: If no realized stocks from PL, try calculating from transactions
      if (realizedStocksFromPL.length === 0 && transactions.length > 0) {
        console.log(`API: ⚠️  No realized stocks from PL, falling back to transaction-based calculation`);
        const realizedStocksPromise = calculateRealizedStocks(transactions, holdings);
        const timeoutPromise = new Promise<any[]>((resolve) => {
          setTimeout(() => {
            console.log('Realized stocks calculation timed out after 30 seconds');
            resolve([]);
          }, 30000);
        });
        realizedStocks = await Promise.race([realizedStocksPromise, timeoutPromise]);
      } else {
        realizedStocks = realizedStocksFromPL;
      }
      
      // VERIFICATION: Ensure ALL unique stocks from RealizedProfitLoss are in realized stocks
      const uniqueStocksInPL = new Set(
        realizedPL
          .filter((r: any) => r.stockName && r.stockName.trim())
          .map((r: any) => {
            const isin = normalizeIsin(r.isin || '');
            return isin || String(r.stockName).trim().toLowerCase();
          })
      );
      const uniqueStocksInResult = new Set(
        realizedStocks.map((s: any) => {
          const isin = normalizeIsin(s.isin || '');
          return isin || String(s.stockName).trim().toLowerCase();
        })
      );
      
      const missingStocksFromResult = Array.from(uniqueStocksInPL).filter(
        stock => !uniqueStocksInResult.has(stock)
      );
      
      if (missingStocksFromResult.length > 0) {
        console.error(`API: ❌❌❌ CRITICAL: ${missingStocksFromResult.length} stocks from RealizedProfitLoss are MISSING from realized stocks!`);
        console.error(`API: Missing stocks:`, missingStocksFromResult.slice(0, 10));
        
        // Add missing stocks back
        for (const missingKey of missingStocksFromResult) {
          const missingPLRecords = realizedPL.filter((r: any) => {
            const rKey = normalizeIsin(r.isin || '') || String(r.stockName).trim().toLowerCase();
            return rKey === missingKey;
          });
          
          if (missingPLRecords.length > 0) {
            const firstRecord = missingPLRecords[0];
            console.error(`API: 🔴 Adding back missing stock: ${firstRecord.stockName}`);
            
            // Aggregate the missing stock's data
            const totalClosedQty = missingPLRecords.reduce((sum, r) => sum + (Number(r.closedQty) || 0), 0);
            const totalBuyValue = missingPLRecords.reduce((sum, r) => sum + (Number(r.buyValue) || 0), 0);
            const totalSellValue = missingPLRecords.reduce((sum, r) => sum + (Number(r.sellValue) || 0), 0);
            const totalRealizedPL = missingPLRecords.reduce((sum, r) => sum + (Number(r.realizedProfitLoss) || 0), 0);
            
            const avgBuyPrice = totalClosedQty > 0 ? (totalBuyValue / totalClosedQty) : 0;
            const avgSoldPrice = totalClosedQty > 0 ? (totalSellValue / totalClosedQty) : 0;
            
            const currentPrice = await getCurrentStockPrice(normalizeIsin(firstRecord.isin));
            const currentValue = currentPrice > 0 ? (totalClosedQty * currentPrice) : 0;
            const unrealizedPL = currentValue - totalBuyValue;
            const totalPL = totalRealizedPL + unrealizedPL;
            const totalPLPercent = totalBuyValue > 0 ? (totalPL / totalBuyValue) * 100 : 0;
            
            // Get dates
            const sellDates = missingPLRecords.map(r => r.sellDate ? new Date(r.sellDate) : null).filter(Boolean) as Date[];
            const buyDates = missingPLRecords.map(r => r.buyDate ? new Date(r.buyDate) : null).filter(Boolean) as Date[];
            const lastSellDate = sellDates.length > 0 ? sellDates.reduce((latest, d) => d > latest ? d : latest) : new Date();
            const firstBuyDate = buyDates.length > 0 ? buyDates.reduce((earliest, d) => d < earliest ? d : earliest) : new Date();
            
            // Calculate holding period
            let holdingPeriodYears = 0;
            let holdingPeriodMonths = 0;
            let holdingPeriodDays = 0;
            if (lastSellDate && firstBuyDate) {
              const daysDiff = Math.floor((lastSellDate.getTime() - firstBuyDate.getTime()) / (1000 * 60 * 60 * 24));
              if (daysDiff < 30) {
                holdingPeriodDays = daysDiff;
              } else {
                const monthsDiff = Math.floor(daysDiff / 30);
                holdingPeriodYears = Math.floor(monthsDiff / 12);
                holdingPeriodMonths = monthsDiff % 12;
              }
            }
            
            const missingStock = {
              stockName: String(firstRecord.stockName || '').trim(),
              sectorName: String(firstRecord.sectorName || '').trim() || 'Unknown',
              isin: normalizeIsin(firstRecord.isin || ''),
              qtySold: totalClosedQty || 1,
              avgCost: avgBuyPrice,
              avgSoldPrice: avgSoldPrice,
              totalInvested: totalBuyValue,
              lastSoldDate: lastSellDate,
              currentPrice: currentPrice,
              currentValue: currentValue,
              realizedPL: totalRealizedPL,
              unrealizedPL: unrealizedPL,
              totalPL: totalPL,
              totalPLPercent: totalPLPercent,
              xirr: 0,
              cagr: 0,
              holdingPeriodYears: holdingPeriodYears,
              holdingPeriodMonths: holdingPeriodMonths,
              holdingPeriodDays: holdingPeriodDays,
            };
            
            realizedStocks.push(missingStock);
            if (firstRecord.stockName?.toLowerCase().includes('ola electric')) {
              console.error(`API: ✅✅✅ Ola Electric added back to realized stocks!`);
            }
          }
        }
        
        // Re-sort after adding missing stocks
        realizedStocks.sort((a, b) => {
          const aTime = a.lastSoldDate instanceof Date ? a.lastSoldDate.getTime() : new Date(a.lastSoldDate).getTime();
          const bTime = b.lastSoldDate instanceof Date ? b.lastSoldDate.getTime() : new Date(b.lastSoldDate).getTime();
          return bTime - aTime;
        });
        
        console.error(`API: ✅ After adding missing stocks: ${realizedStocks.length} total realized stocks`);
      } else {
        console.log(`API: ✅✅✅ All ${uniqueStocksInPL.size} unique stocks from RealizedProfitLoss are in realized stocks!`);
      }
      
      // Log Ola Electric specifically
      const olaElectric = realizedStocks.find((s: any) => s.stockName?.toLowerCase().includes('ola electric'));
      if (olaElectric) {
        console.log(`API: ✅✅✅ Found Ola Electric in realized stocks:`, {
          stockName: olaElectric.stockName,
          isin: olaElectric.isin,
          qtySold: olaElectric.qtySold,
          realizedPL: olaElectric.realizedPL,
        });
      } else {
        console.error(`API: ❌❌❌ Ola Electric STILL NOT found in realized stocks after all safeguards!`);
        console.error(`API: Realized stocks count: ${realizedStocks.length}`);
        console.error(`API: Realized PL records count: ${realizedPL.length}`);
      }
    } catch (error: any) {
      console.error('Error calculating realized stocks:', error);
      console.error('Error stack:', error?.stack);
      realizedStocks = []; // Return empty array on error
    }

    // CRITICAL: Before processing, re-query database to ensure we have ALL holdings
    console.log(`\n=== FINAL API RESPONSE PREPARATION ===`);
    console.log(`API: ✅ Holdings count from initial query: ${holdings.length}`);
    
    // Re-query ALL holdings one more time to catch any that might have been missed
    await new Promise(resolve => setTimeout(resolve, 200)); // Brief delay for consistency
    const finalHoldingsQuery = await Holding.find({ clientId }).lean();
    console.log(`API: ✅ Final holdings query count: ${finalHoldingsQuery.length}`);
    
    // Normalize ISINs in final query
    const finalHoldingsNormalized = finalHoldingsQuery.map((h: any) => ({
      ...h,
      isin: normalizeIsin(h.isin),
    }));
    
    // Merge with existing holdings, avoiding duplicates
    const holdingsMap = new Map();
    holdings.forEach((h: any) => {
      const key = normalizeIsin(h.isin);
      if (key) holdingsMap.set(key, h);
    });
    
    finalHoldingsNormalized.forEach((h: any) => {
      const key = normalizeIsin(h.isin);
      if (key && !holdingsMap.has(key)) {
        holdingsMap.set(key, h);
        console.log(`API: ✅ Added missing holding from final query: ${h.stockName} (${h.isin})`);
      }
    });
    
    // Update holdings array with merged results
    holdings = Array.from(holdingsMap.values());
    console.log(`API: ✅ Final holdings count after merge: ${holdings.length}`);
    
    console.log(`API: ✅ All ISINs before processing:`, holdings.map((h: any) => h.isin));
    
    // CRITICAL: Store original holdings count and list before Promise.allSettled
    const originalHoldingsCount = holdings.length;
    const originalHoldingsIsins = new Set(holdings.map((h: any) => normalizeIsin(h.isin)).filter(Boolean));
    console.log(`API: 📋 Original holdings count: ${originalHoldingsCount}`);
    console.log(`API: 📋 Original ISINs:`, Array.from(originalHoldingsIsins).sort());
    
    
    const processedHoldingsPromise = Promise.allSettled(holdings.map(async (h: any, index: number) => {
          }
          
          try {
            // Calculate XIRR, CAGR, and Holding Period for each stock
            // CRITICAL: Normalize ISINs for comparison to avoid mismatches
            const holdingNormalizedIsin = normalizeIsin(h.isin);
            const stockTransactions = transactions.filter(t => normalizeIsin(t.isin) === holdingNormalizedIsin);
            
            }
            
            let stockXIRR = 0;
            let cagr = 0;
            let holdingPeriodYears = 0;
            let holdingPeriodMonths = 0;
            
            try {
              stockXIRR = calculateStockXIRR(stockTransactions, h);
              }
            } catch (error: any) {
              console.error(`Error calculating XIRR for ${h.isin}:`, error);
              }
            }
            
            try {
              const result = calculateStockCAGRAndHoldingPeriod(stockTransactions, h);
              cagr = result.cagr;
              holdingPeriodYears = result.holdingPeriodYears;
              holdingPeriodMonths = result.holdingPeriodMonths;
              }
            } catch (error: any) {
              console.error(`Error calculating CAGR for ${h.isin}:`, error);
              }
            }
            
            const result = {
              ...h,
              _id: (h._id?.toString && typeof h._id.toString === 'function') ? h._id.toString() : String(h._id || ''),
              isin: holdingNormalizedIsin, // Ensure ISIN is normalized in result
              xirr: stockXIRR,
              cagr: cagr,
              holdingPeriodYears: holdingPeriodYears,
              holdingPeriodMonths: holdingPeriodMonths,
            };
            
            }
            
            return result;
          } catch (error: any) {
            console.error(`Error processing holding ${h.isin}:`, error);
            }
            return {
              ...h,
              _id: (h._id?.toString && typeof h._id.toString === 'function') ? h._id.toString() : String(h._id || ''),
              isin: normalizeIsin(h.isin), // Ensure ISIN is normalized
              xirr: 0,
              cagr: 0,
              holdingPeriodYears: 0,
              holdingPeriodMonths: 0,
            };
          }
        })).then(async (results) => {
          // ✅ DIAGNOSTIC LOG: After Promise.allSettled (as suggested by user)
          console.log(`✅ Promise.allSettled completed: ${results.length} results`);
          console.log(`✅ Results status breakdown:`, {
            fulfilled: results.filter(r => r.status === 'fulfilled').length,
            rejected: results.filter(r => r.status === 'rejected').length,
          });
          
          );
            });
          }
          
          // CRITICAL: Build processedHoldings ensuring ALL original holdings are included
          // ✅ FIX: Never drop holdings, even if processing failed
          const processedHoldings: any[] = [];
          const processedIsins = new Set<string>();
          
          // First, process all results (both fulfilled AND rejected)
          results.forEach((result, index) => {
            const original = holdings[index];
            if (!original) {
              console.error(`API: ⚠️  No original holding at index ${index}`);
              return;
            }
            
            const originalIsin = normalizeIsin(original.isin);
            
            if (result.status === 'fulfilled' && result.value) {
              // Successfully processed
              const processedIsin = normalizeIsin(result.value.isin);
              processedHoldings.push(result.value);
              processedIsins.add(processedIsin);
              }
            } else {
              // ✅ FIX: Processing failed - ALWAYS use original with defaults (never drop)
              // This handles both rejected promises AND fulfilled promises with null/undefined values
              const failedHolding = {
                ...original,
                _id: (original._id?.toString && typeof original._id.toString === 'function') 
                  ? original._id.toString() 
                  : String(original._id || ''),
                isin: originalIsin,
                xirr: 0,
                cagr: 0,
                holdingPeriodYears: 0,
                holdingPeriodMonths: 0,
                note: result.status === 'rejected' ? 'Processing failed - using defaults' : 'Processing returned no value - using defaults',
              };
              processedHoldings.push(failedHolding);
              processedIsins.add(originalIsin);
                if (result.status === 'rejected') {
                }
              }
            }
          });
          
          // CRITICAL: Check if any original holdings were missed
          const missingFromProcessed = holdings.filter((h: any) => {
            const key = normalizeIsin(h.isin);
            return key && !processedIsins.has(key);
          });
          
          if (missingFromProcessed.length > 0) {
            console.error(`API: ❌❌❌ ${missingFromProcessed.length} holdings MISSED by Promise.allSettled! Adding them...`);
            missingFromProcessed.forEach((original: any) => {
              const key = normalizeIsin(original.isin);
              }
              processedHoldings.push({
                ...original,
                _id: (original._id?.toString && typeof original._id.toString === 'function') 
                  ? original._id.toString() 
                  : String(original._id || ''),
                isin: key,
                xirr: 0,
                cagr: 0,
                holdingPeriodYears: 0,
                holdingPeriodMonths: 0,
              });
              processedIsins.add(key);
            });
            console.log(`API: ✅ Added ${missingFromProcessed.length} missing holdings. New count: ${processedHoldings.length}`);
          }
          
          );
          } else {
          }
          
          console.log(`API: Processed ${processedHoldings.length} holdings (should be ${holdings.length})`);
          
          // CRITICAL: Compare counts and ensure ALL holdings from database are included
          if (processedHoldings.length !== holdings.length) {
            console.error(`API: ⚠️  COUNT MISMATCH! Expected ${holdings.length}, got ${processedHoldings.length}`);
            const originalIsins = new Set(holdings.map((h: any) => normalizeIsin(h.isin)).filter(Boolean));
            const processedIsins = new Set(processedHoldings.map((h: any) => normalizeIsin(h.isin)).filter(Boolean));
            const missing = Array.from(originalIsins).filter(isin => !processedIsins.has(isin));
            console.error(`API: Missing ISINs after processing:`, missing);
            
            // Add back any missing holdings
            holdings.forEach((originalH: any) => {
              const originalIsin = normalizeIsin(originalH.isin);
              if (originalIsin && !processedIsins.has(originalIsin)) {
                console.error(`API: 🔴 Adding back missing holding: ${originalH.stockName} (${originalIsin})`);
                const stockTransactions = transactions.filter((t: any) => 
                  normalizeIsin(t.isin) === originalIsin
                );
                let stockXIRR = 0;
                let cagr = 0;
                let holdingPeriodYears = 0;
                let holdingPeriodMonths = 0;
                try {
                  stockXIRR = calculateStockXIRR(stockTransactions, originalH);
                  const result = calculateStockCAGRAndHoldingPeriod(stockTransactions, originalH);
                  cagr = result.cagr;
                  holdingPeriodYears = result.holdingPeriodYears;
                  holdingPeriodMonths = result.holdingPeriodMonths;
                } catch (e) {
                  console.error(`API: Error calculating metrics for ${originalH.stockName}:`, e);
                }
                processedHoldings.push({
                  ...originalH,
                  _id: (originalH._id?.toString && typeof originalH._id.toString === 'function') 
                    ? originalH._id.toString() 
                    : String(originalH._id || ''),
                  isin: originalIsin,
                  xirr: stockXIRR,
                  cagr: cagr,
                  holdingPeriodYears: holdingPeriodYears,
                  holdingPeriodMonths: holdingPeriodMonths,
                });
              }
            });
            console.log(`API: ✅ After adding back missing, count: ${processedHoldings.length}`);
          }
          
          // FINAL LOG: All ISINs after processing
          console.log(`API: ✅ Final processed holdings count: ${processedHoldings.length}`);
          console.log(`✅ Processed holdings after Promise.allSettled:`, processedHoldings.map((h: any) => normalizeIsin(h.isin)).sort());
          
          // 🚨 DIAGNOSTIC: Compare before and after counts
          if (processedHoldings.length !== originalHoldingsCount) {
            console.error(`🚨🚨🚨 CRITICAL: Holdings count dropped from ${originalHoldingsCount} to ${processedHoldings.length}!`);
          } else {
            console.log(`✅✅✅ Holdings count maintained: ${processedHoldings.length} (expected: ${originalHoldingsCount})`);
          }
          
          } else {
              });
            } else {
            }
          }
          
          // FINAL SAFEGUARD: Verify ALL expected holdings are present
          const expectedIsinsFinal = new Set(holdings.map((h: any) => normalizeIsin(h.isin)).filter(Boolean));
          const processedIsinsFinal = new Set(processedHoldings.map((h: any) => normalizeIsin(h.isin)).filter(Boolean));
          const missingInFinal = Array.from(expectedIsinsFinal).filter(isin => !processedIsinsFinal.has(isin));
          
          let finalProcessedHoldings = [...processedHoldings];
          
          if (missingInFinal.length > 0) {
            console.error(`API: ⚠️  ${missingInFinal.length} holdings missing from processed results!`);
            console.error(`API: Missing ISINs:`, missingInFinal);
            
            // Add missing holdings back
            for (const missingIsin of missingInFinal) {
              const missingHolding = holdings.find((h: any) => normalizeIsin(h.isin) === missingIsin);
              if (missingHolding) {
                console.error(`API: 🔧 Adding missing holding back: ${missingHolding.stockName} (${missingIsin})`);
                // Try to get from direct query first
                const directQuery = await Holding.findOne({ clientId, isin: missingIsin }).lean() as any;
                const holdingToAdd = (directQuery && !Array.isArray(directQuery)) ? directQuery : missingHolding;
                
                finalProcessedHoldings.push({
                  ...holdingToAdd,
                  _id: (holdingToAdd._id?.toString && typeof holdingToAdd._id.toString === 'function') 
                    ? holdingToAdd._id.toString() 
                    : String(holdingToAdd._id || ''),
                  isin: normalizeIsin(holdingToAdd.isin),
                  xirr: 0,
                  cagr: 0,
                  holdingPeriodYears: 0,
                  holdingPeriodMonths: 0,
                });
                console.log(`API: ✅ Added ${missingHolding.stockName} to processed holdings`);
              }
            }
            
            // Re-verify
            const finalIsins = new Set(finalProcessedHoldings.map((h: any) => normalizeIsin(h.isin)).filter(Boolean));
            if (finalIsins.size === expectedIsinsFinal.size) {
              console.log(`API: ✅✅✅ All holdings restored! Final count: ${finalProcessedHoldings.length}`);
            }
          }
          
          
          console.log(`=== END API RESPONSE PREPARATION ===`);
          console.log(`API: Final processed holdings count: ${finalProcessedHoldings.length}`);
          console.log(`API: Final ISINs:`, finalProcessedHoldings.map((h: any) => normalizeIsin(h.isin)).sort());
          console.log(`\n`);
          
          return finalProcessedHoldings;
        });
    
    // Process the holdings
    let finalHoldingsResult = await processedHoldingsPromise;
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`API: 📊 STEP 1 - Result from Promise.allSettled processing: ${finalHoldingsResult.length} holdings`);
    console.log(`API: 📊 Expected: ${originalHoldingsCount} holdings`);
    if (finalHoldingsResult.length !== originalHoldingsCount) {
      console.error(`API: ❌ MISMATCH! Expected ${originalHoldingsCount}, got ${finalHoldingsResult.length}`);
    }
    console.log(`API: 📊 Result ISINs (${finalHoldingsResult.length}):`, finalHoldingsResult.map((h: any) => normalizeIsin(h.isin)).sort());
    const missingFromStep1 = Array.from(originalHoldingsIsins).filter(isin => 
      !finalHoldingsResult.some((h: any) => normalizeIsin(h.isin) === isin)
    );
    if (missingFromStep1.length > 0) {
      console.error(`API: ❌ Missing ISINs after Step 1:`, missingFromStep1);
    }
    console.log(`${'='.repeat(80)}\n`);
    
    // FINAL FINAL SAFEGUARD: Ensure we have ALL holdings from the original query
    const finalIsinsInResult = new Set(finalHoldingsResult.map((h: any) => normalizeIsin(h.isin)).filter(Boolean));
    const stillMissing = Array.from(originalHoldingsIsins).filter(isin => !finalIsinsInResult.has(isin));
    
    if (stillMissing.length > 0) {
      console.error(`API: 🚨🚨🚨 CRITICAL: ${stillMissing.length} holdings STILL missing from final result!`);
      console.error(`API: Missing ISINs:`, stillMissing);
      
      // Add ALL missing holdings from the original holdings array
      for (const missingIsin of stillMissing) {
        const originalHolding = holdings.find((h: any) => normalizeIsin(h.isin) === missingIsin);
        if (originalHolding) {
          console.error(`API: 🔧🔧🔧 ADDING ${originalHolding.stockName} (${missingIsin}) - FINAL SAFEGUARD!`);
          
          // Create a minimal holding object with defaults
          const missingHoldingToAdd = {
            ...originalHolding,
            _id: (originalHolding._id?.toString && typeof originalHolding._id.toString === 'function') 
              ? originalHolding._id.toString() 
              : String(originalHolding._id || ''),
            isin: normalizeIsin(originalHolding.isin),
            xirr: 0,
            cagr: 0,
            holdingPeriodYears: 0,
            holdingPeriodMonths: 0,
            // Ensure all required fields have defaults
            stockName: originalHolding.stockName || '',
            sectorName: originalHolding.sectorName || '',
            openQty: originalHolding.openQty || 0,
            marketPrice: originalHolding.marketPrice || 0,
            marketValue: originalHolding.marketValue || 0,
            investmentAmount: originalHolding.investmentAmount || 0,
            avgCost: originalHolding.avgCost || 0,
            profitLossTillDate: originalHolding.profitLossTillDate || 0,
            profitLossTillDatePercent: originalHolding.profitLossTillDatePercent || 0,
          };
          
          finalHoldingsResult.push(missingHoldingToAdd);
          console.log(`API: ✅ Added ${originalHolding.stockName} to final result. New count: ${finalHoldingsResult.length}`);
        } else {
          console.error(`API: ❌ Original holding not found for ISIN: ${missingIsin}`);
        }
      }
      
      console.log(`API: ✅✅✅ Final holdings count after safeguard: ${finalHoldingsResult.length}`);
    }
    
    // Verify final count
    if (finalHoldingsResult.length !== originalHoldingsCount) {
      console.error(`API: ⚠️  Final count (${finalHoldingsResult.length}) doesn't match original (${originalHoldingsCount})`);
      
      // LAST RESORT: If still not matching, use original holdings array with minimal processing
      if (finalHoldingsResult.length < originalHoldingsCount) {
        console.error(`API: 🔴🔴🔴 LAST RESORT: Using original holdings array to ensure all holdings are included!`);
        finalHoldingsResult = holdings.map((h: any) => {
          const existing = finalHoldingsResult.find((fh: any) => normalizeIsin(fh.isin) === normalizeIsin(h.isin));
          if (existing) {
            return existing; // Use the processed version
          } else {
            // Return minimal version
            return {
              ...h,
              _id: (h._id?.toString && typeof h._id.toString === 'function') 
                ? h._id.toString() 
                : String(h._id || ''),
              isin: normalizeIsin(h.isin),
              xirr: 0,
              cagr: 0,
              holdingPeriodYears: 0,
              holdingPeriodMonths: 0,
            };
          }
        });
        console.log(`API: ✅✅✅ Last resort applied. Final count: ${finalHoldingsResult.length}`);
      }
    } else {
      console.log(`API: ✅✅✅ Final count matches original: ${finalHoldingsResult.length}`);
    }
    
    // Final verification
    } else {
      
      // ABSOLUTE LAST RESORT: Query database directly one more time
      const dbFinalQuery = await Holding.find({ clientId }).lean();
      console.log(`API: Database query returned ${dbFinalQuery.length} holdings`);
      
      // Also check if we're missing any other holdings
      const dbIsins = new Set(dbFinalQuery.map((h: any) => normalizeIsin(h.isin)).filter(Boolean));
      const responseIsins = new Set(finalHoldingsResult.map((h: any) => normalizeIsin(h.isin)).filter(Boolean));
      const missingFromDb = Array.from(dbIsins).filter(isin => !responseIsins.has(isin));
      
      if (missingFromDb.length > 0) {
        console.error(`API: 🔴 Missing ${missingFromDb.length} holdings from response! Adding all...`);
        for (const missingIsin of missingFromDb) {
          const missingHolding = dbFinalQuery.find((h: any) => normalizeIsin(h.isin) === missingIsin);
          if (missingHolding) {
            missingHolding.isin = normalizeIsin(missingHolding.isin);
            const holdingToAdd = {
              ...missingHolding,
              _id: (missingHolding._id?.toString && typeof missingHolding._id.toString === 'function') 
                ? missingHolding._id.toString() 
                : String(missingHolding._id || ''),
              xirr: 0,
              cagr: 0,
              holdingPeriodYears: 0,
              holdingPeriodMonths: 0,
            };
            finalHoldingsResult.push(holdingToAdd);
            console.log(`API: ✅ Added ${missingHolding.stockName} (${missingIsin}) from database`);
          }
        }
      }
    }
    
    console.log(`API: 🎯 FINAL RESPONSE - Holdings count: ${finalHoldingsResult.length}`);
    console.log(`API: 🎯 FINAL ISINs:`, finalHoldingsResult.map((h: any) => normalizeIsin(h.isin)).sort());
    
    const dbCount = await Holding.countDocuments({ clientId });
    console.log(`API: 📊 Database count: ${dbCount}, Response count: ${finalHoldingsResult.length}`);
    
    // Rebuild if counts don't match
    if (finalHoldingsResult.length !== dbCount) {
      console.error(`API: ⚠️  REBUILD REQUIRED! Response: ${finalHoldingsResult.length}, DB: ${dbCount}`);
      console.error(`API: 🔴🔴🔴 USING DATABASE AS SOURCE OF TRUTH - Rebuilding from scratch...`);
      
      // Use database as source of truth
      const dbAllHoldings = await Holding.find({ clientId }).lean();
      console.log(`API: Fetched ${dbAllHoldings.length} holdings directly from database`);
      
      // Process each one minimally (just calculate metrics)
      const dbProcessedHoldings = await Promise.all(
        dbAllHoldings.map(async (h: any) => {
          const normalizedIsin = normalizeIsin(h.isin);
          const stockTransactions = transactions.filter((t: any) => 
            normalizeIsin(t.isin) === normalizedIsin
          );
          
          let stockXIRR = 0;
          let cagr = 0;
          let holdingPeriodYears = 0;
          let holdingPeriodMonths = 0;
          
          try {
            stockXIRR = calculateStockXIRR(stockTransactions, h);
          } catch (error: any) {
            console.error(`Error calculating XIRR for ${h.isin}:`, error);
          }
          
          try {
            const result = calculateStockCAGRAndHoldingPeriod(stockTransactions, h);
            cagr = result.cagr;
            holdingPeriodYears = result.holdingPeriodYears;
            holdingPeriodMonths = result.holdingPeriodMonths;
          } catch (error: any) {
            console.error(`Error calculating CAGR for ${h.isin}:`, error);
          }
          
          return {
            ...h,
            _id: (h._id?.toString && typeof h._id.toString === 'function') 
              ? h._id.toString() 
              : String(h._id || ''),
            isin: normalizedIsin,
            xirr: stockXIRR,
            cagr: cagr,
            holdingPeriodYears: holdingPeriodYears,
            holdingPeriodMonths: holdingPeriodMonths,
          };
        })
      );
      
      finalHoldingsResult = dbProcessedHoldings;
      console.log(`API: ✅✅✅ Rebuilt from database. Final count: ${finalHoldingsResult.length}`);
      
      );
      } else {
      }
      
      console.log(`API: ✅✅✅ All ISINs:`, finalHoldingsResult.map((h: any) => h.isin).sort());
    } else {
          clientId, 
          $or: [
          ]
        }).lean() as any;
        
          const stockTransactionsFinal = transactions.filter((t: any) => 
          );
          let stockXIRR = 0;
          let cagr = 0;
          let holdingPeriodYears = 0;
          let holdingPeriodMonths = 0;
          try {
            cagr = result.cagr;
            holdingPeriodYears = result.holdingPeriodYears;
            holdingPeriodMonths = result.holdingPeriodMonths;
          } catch (e) {
          }
          finalHoldingsResult.push({
            xirr: stockXIRR,
            cagr: cagr,
            holdingPeriodYears: holdingPeriodYears,
            holdingPeriodMonths: holdingPeriodMonths,
          });
        } else {
        }
      }
    }
    
    // ABSOLUTE FINAL VERIFICATION before sending response
    );
    
        clientId,
        $or: [
        ]
      }).lean() as any;
      
        const stockTransactionsFinal = transactions.filter((t: any) => 
        );
        let stockXIRR = 0;
        let cagr = 0;
        let holdingPeriodYears = 0;
        let holdingPeriodMonths = 0;
        try {
          cagr = result.cagr;
          holdingPeriodYears = result.holdingPeriodYears;
          holdingPeriodMonths = result.holdingPeriodMonths;
        } catch (e) {
        }
        finalHoldingsResult.push({
          xirr: stockXIRR,
          cagr: cagr,
          holdingPeriodYears: holdingPeriodYears,
          holdingPeriodMonths: holdingPeriodMonths,
        });
      } else {
      }
    } else {
    }
    
    // ✅ OPTION 3: Final Safety Net - Compare DB ISINs with Response ISINs (as suggested by user)
    const finalDbCount = await Holding.countDocuments({ clientId });
    console.log(`API: 🎯 FINAL: DB count=${finalDbCount}, Response count=${finalHoldingsResult.length}`);
    
    // Get all ISINs from database
    const dbAllHoldingsFinalCheck = await Holding.find({ clientId }).lean();
    const dbIsins = new Set(dbAllHoldingsFinalCheck.map((h: any) => normalizeIsin(h.isin)).filter(Boolean));
    const responseIsins = new Set(finalHoldingsResult.map((h: any) => normalizeIsin(h.isin)).filter(Boolean));
    const missingFromResponse = Array.from(dbIsins).filter(isin => !responseIsins.has(isin));
    
    if (missingFromResponse.length > 0) {
      console.error(`API: 🚨🚨🚨 FINAL SAFETY NET: ${missingFromResponse.length} holdings missing from response!`);
      console.error(`API: Missing ISINs:`, missingFromResponse);
      
      // Add all missing holdings from database
      for (const missingIsin of missingFromResponse) {
        const missingHolding = dbAllHoldingsFinalCheck.find((h: any) => normalizeIsin(h.isin) === missingIsin);
        if (missingHolding) {
          console.error(`API: 🔧 Adding missing holding from DB: ${missingHolding.stockName} (${missingIsin})`);
          
          // Calculate metrics for the missing holding
          const stockTransactionsMissing = transactions.filter((t: any) => 
            normalizeIsin(t.isin) === missingIsin
          );
          let stockXIRR = 0;
          let cagr = 0;
          let holdingPeriodYears = 0;
          let holdingPeriodMonths = 0;
          
          try {
            stockXIRR = calculateStockXIRR(stockTransactionsMissing, missingHolding);
            const result = calculateStockCAGRAndHoldingPeriod(stockTransactionsMissing, missingHolding);
            cagr = result.cagr;
            holdingPeriodYears = result.holdingPeriodYears;
            holdingPeriodMonths = result.holdingPeriodMonths;
          } catch (e) {
            console.error(`API: Error calculating metrics for ${missingHolding.stockName}:`, e);
          }
          
          finalHoldingsResult.push({
            ...missingHolding,
            _id: (missingHolding._id?.toString && typeof missingHolding._id.toString === 'function') 
              ? missingHolding._id.toString() 
              : String(missingHolding._id || ''),
            isin: normalizeIsin(missingHolding.isin),
            xirr: stockXIRR,
            cagr: cagr,
            holdingPeriodYears: holdingPeriodYears,
            holdingPeriodMonths: holdingPeriodMonths,
            note: 'Re-added from DB fallback',
          });
          console.log(`API: ✅ Added ${missingHolding.stockName} (${missingIsin}) to response`);
        }
      }
      
      console.log(`API: ✅✅✅ Final safety net complete. New response count: ${finalHoldingsResult.length}`);
    } else {
      console.log(`API: ✅✅✅ Final safety net: All DB holdings are in response (${finalHoldingsResult.length}/${dbAllHoldingsFinalCheck.length})`);
    }
    
    const finalDbCountCheck = await Holding.countDocuments({ clientId });
    
    if (finalHoldingsResult.length !== finalDbCountCheck) {
      console.error(`API: 🔴 REBUILDING ENTIRE RESPONSE FROM DATABASE...`);
      
      // Rebuild from scratch using database as source of truth
      // CRITICAL: Use countDocuments first to see the actual count
      const dbCountCheck = await Holding.countDocuments({ clientId });
      console.error(`API: countDocuments says there are ${dbCountCheck} holdings in database`);
      
      const allDbHoldingsFinal = await Holding.find({ clientId }).lean();
      console.error(`API: find({ clientId }) returned ${allDbHoldingsFinal.length} holdings`);
      
      if (dbCountCheck !== allDbHoldingsFinal.length) {
        console.error(`API: 🔴🔴🔴 CRITICAL MISMATCH! countDocuments=${dbCountCheck} but find()=${allDbHoldingsFinal.length}`);
        console.error(`API: 🔴 This means find({ clientId }) is not returning all documents!`);
        
        // Try to find what's missing by checking each document individually
        const allIsinsFromCount = new Set<string>();
        for (let i = 0; i < dbCountCheck; i++) {
          const testHolding = await Holding.findOne({ clientId }).skip(i).lean() as any;
          if (testHolding && !Array.isArray(testHolding)) {
            allIsinsFromCount.add(normalizeIsin(testHolding.isin));
          }
        }
        const allIsinsFromFind = new Set<string>(allDbHoldingsFinal.map((h: any) => normalizeIsin(h.isin)));
        const missingFromFind = Array.from(allIsinsFromCount).filter((isin: string) => !allIsinsFromFind.has(isin));
        
        if (missingFromFind.length > 0) {
          console.error(`API: 🔴 Missing ISINs from find():`, missingFromFind);
          
          // Try to find them individually
          for (const missingIsin of missingFromFind) {
            const missingHolding = await Holding.findOne({ 
              clientId, 
              isin: missingIsin 
            }).lean() as any;
            if (missingHolding && !Array.isArray(missingHolding)) {
              console.error(`API: 🔴 But findOne({ clientId, isin: "${missingIsin}" }) WORKS! Adding manually...`);
              allDbHoldingsFinal.push(missingHolding);
            }
          }
        }
      }
      
      // Process each holding
      finalHoldingsResult = await Promise.all(
        allDbHoldingsFinal.map(async (h: any) => {
          const normalizedIsin = normalizeIsin(h.isin);
          const stockTransactions = transactions.filter((t: any) => 
            normalizeIsin(t.isin) === normalizedIsin
          );
          
          let stockXIRR = 0;
          let cagr = 0;
          let holdingPeriodYears = 0;
          let holdingPeriodMonths = 0;
          
          try {
            stockXIRR = calculateStockXIRR(stockTransactions, h);
          } catch (error: any) {
            console.error(`Error calculating XIRR for ${h.isin}:`, error);
          }
          
          try {
            const result = calculateStockCAGRAndHoldingPeriod(stockTransactions, h);
            cagr = result.cagr;
            holdingPeriodYears = result.holdingPeriodYears;
            holdingPeriodMonths = result.holdingPeriodMonths;
          } catch (error: any) {
            console.error(`Error calculating CAGR for ${h.isin}:`, error);
          }
          
          return {
            ...h,
            _id: (h._id?.toString && typeof h._id.toString === 'function') 
              ? h._id.toString() 
              : String(h._id || ''),
            isin: normalizedIsin,
            xirr: stockXIRR,
            cagr: cagr,
            holdingPeriodYears: holdingPeriodYears,
            holdingPeriodMonths: holdingPeriodMonths,
          };
        })
      );
      
      console.error(`API: ✅✅✅ Rebuilt response from database. Final count: ${finalHoldingsResult.length}`);
    }
    
    // LAST CHECK: Log what we're actually returning
    console.log(`API: 🎯 RETURNING: ${finalHoldingsResult.length} holdings`);
    console.log(`API: 🎯 RETURNING ISINs:`, finalHoldingsResult.map((h: any) => normalizeIsin(h.isin)).sort());
    
    return NextResponse.json({
      success: true,
      data: {
        summary: {
          currentValue,
          totalInvested,
          totalProfitLoss,
          totalRealizedPL,
          totalReturn: currentValue - totalInvested,
          totalReturnPercent: totalInvested > 0 ? ((currentValue - totalInvested) / totalInvested) * 100 : 0,
          xirr: xirrData,
        },
        topPerformers,
        worstPerformers,
        holdings: finalHoldingsResult,
        monthlyInvestments,
        monthlyDividends,
        monthlyReturns,
        returnStatistics,
        industryDistribution,
        realizedStocks,
        transactions: transactions.map((t: any) => ({
          isin: t.isin,
          transactionDate: t.transactionDate,
          buySell: t.buySell,
          tradePriceAdjusted: t.tradePriceAdjusted,
          tradedQty: t.tradedQty,
          tradeValueAdjusted: t.tradeValueAdjusted,
        })),
      },
    });
  } catch (error: any) {
    const errorDetails = {
      message: error?.message || 'Unknown error',
      name: error?.name || 'Error',
      code: error?.code,
      stack: error?.stack,
      toString: String(error),
    };
    
    console.error('='.repeat(60));
    console.error('Dashboard API ERROR - Full Details:');
    console.error('='.repeat(60));
    console.error('Error message:', errorDetails.message);
    console.error('Error name:', errorDetails.name);
    console.error('Error code:', errorDetails.code);
    console.error('Error toString:', errorDetails.toString);
    console.error('Error stack:', errorDetails.stack);
    console.error('='.repeat(60));
    
    // Also try to log any additional error properties
    if (error && typeof error === 'object') {
      console.error('Additional error properties:');
      Object.keys(error).forEach(key => {
        if (!['message', 'name', 'stack', 'code'].includes(key)) {
          console.error(`  ${key}:`, (error as any)[key]);
        }
      });
    }
    
    return NextResponse.json(
      { 
        error: errorDetails.message || 'Failed to fetch dashboard data',
        errorName: errorDetails.name,
        errorCode: errorDetails.code,
        details: process.env.NODE_ENV === 'development' ? errorDetails.stack : undefined,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * Calculate XIRR for a single stock
 */
function calculateStockXIRR(transactions: any[], holding: any): number {
  // ✅ HARDENED: Never throw, always return a number (as suggested by user)
  try {
    // Validate inputs
    if (!transactions || transactions.length === 0) return 0;
    if (!holding || typeof holding !== 'object') return 0;
    
    const cashFlows: Array<{date: Date, amount: number}> = [];
    
    transactions.forEach(t => {
      try {
        if (!t || typeof t !== 'object') return;
        const buySell = String(t.buySell || '').toUpperCase();
        
        if (buySell === 'BUY') {
          const tradeValue = t.tradeValueAdjusted || (Number(t.tradePriceAdjusted) || 0) * (Number(t.tradedQty) || 0) + (Number(t.charges) || 0);
          const date = t.transactionDate ? new Date(t.transactionDate) : new Date();
          if (!isNaN(date.getTime()) && isFinite(tradeValue)) {
            cashFlows.push({ date, amount: -Math.abs(tradeValue) });
          }
        } else if (buySell === 'SELL') {
          const tradeValue = t.tradeValueAdjusted || (Number(t.tradePriceAdjusted) || 0) * (Number(t.tradedQty) || 0) - (Number(t.charges) || 0);
          const date = t.transactionDate ? new Date(t.transactionDate) : new Date();
          if (!isNaN(date.getTime()) && isFinite(tradeValue)) {
            cashFlows.push({ date, amount: Math.abs(tradeValue) });
          }
        }
      } catch (e) {
        // Skip invalid transaction, continue with others
        console.warn(`Skipping invalid transaction in XIRR calculation:`, e);
      }
    });

    // Current value as final cash flow (only if there's still holding)
    const openQty = Number(holding.openQty) || 0;
    const marketValue = Number(holding.marketValue) || 0;
    if (openQty > 0 && marketValue > 0 && isFinite(marketValue)) {
      cashFlows.push({ date: new Date(), amount: marketValue });
    }

    // Simplified IRR approximation
    if (cashFlows.length < 2) return 0;
    
    // Ensure dates are valid
    const validCashFlows = cashFlows.filter(cf => cf && cf.date && !isNaN(cf.date.getTime()) && isFinite(cf.amount));
    if (validCashFlows.length < 2) return 0;
    
    const totalInvested = Math.abs(validCashFlows.filter(cf => cf.amount < 0).reduce((sum, cf) => sum + cf.amount, 0));
    const totalReturn = validCashFlows.filter(cf => cf.amount > 0).reduce((sum, cf) => sum + cf.amount, 0);
    
    if (totalInvested === 0 || !isFinite(totalInvested) || !isFinite(totalReturn)) return 0;
    
    // Approximate annualized return (simplified)
    const firstDate = validCashFlows[0]?.date;
    if (!firstDate || isNaN(firstDate.getTime())) return 0;
    
    const daysDiff = Math.max(1, (new Date().getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
    const years = daysDiff / 365;
    
    if (years === 0 || !isFinite(years)) return 0;
    
    const returnRatio = totalReturn / totalInvested;
    if (!isFinite(returnRatio) || returnRatio <= 0) return 0;
    
    const annualizedReturn = (Math.pow(returnRatio, 1 / years) - 1) * 100;
    
    return isFinite(annualizedReturn) ? annualizedReturn : 0;
  } catch (error: any) {
    // ✅ Never throw - always return 0 on any error
    console.warn(`Error in calculateStockXIRR for ${holding?.isin || 'unknown'}:`, error?.message || error);
    return 0;
  }
}

/**
 * Calculate CAGR and Holding Period for a single stock
 */
function calculateStockCAGRAndHoldingPeriod(transactions: any[], holding: any): {
  cagr: number;
  holdingPeriodYears: number;
  holdingPeriodMonths: number;
} {
  // ✅ HARDENED: Never throw, always return valid object (as suggested by user)
  try {
    // Validate inputs
    if (!transactions || transactions.length === 0) {
      return { cagr: 0, holdingPeriodYears: 0, holdingPeriodMonths: 0 };
    }
    if (!holding || typeof holding !== 'object') {
      return { cagr: 0, holdingPeriodYears: 0, holdingPeriodMonths: 0 };
    }
    
    const openQty = Number(holding.openQty) || 0;
    if (openQty === 0 || !isFinite(openQty)) {
      return { cagr: 0, holdingPeriodYears: 0, holdingPeriodMonths: 0 };
    }

    // Find first BUY transaction (with error handling)
    let firstBuyTransaction: any = null;
    try {
      const buyTransactions = transactions.filter(t => {
        try {
          return t && String(t.buySell || '').toUpperCase() === 'BUY';
        } catch {
          return false;
        }
      });
      
      if (buyTransactions.length > 0) {
        firstBuyTransaction = buyTransactions.sort((a, b) => {
          try {
            const dateA = a.transactionDate ? new Date(a.transactionDate).getTime() : 0;
            const dateB = b.transactionDate ? new Date(b.transactionDate).getTime() : 0;
            return dateA - dateB;
          } catch {
            return 0;
          }
        })[0];
      }
    } catch (e) {
      console.warn(`Error finding first BUY transaction:`, e);
    }

    if (!firstBuyTransaction || !firstBuyTransaction.transactionDate) {
      return { cagr: 0, holdingPeriodYears: 0, holdingPeriodMonths: 0 };
    }

    const startDate = new Date(firstBuyTransaction.transactionDate);
    const endDate = new Date();
    
    // Validate dates
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return { cagr: 0, holdingPeriodYears: 0, holdingPeriodMonths: 0 };
    }
    
    // Calculate holding period
    const monthsDiff = (endDate.getFullYear() - startDate.getFullYear()) * 12 + 
                       (endDate.getMonth() - startDate.getMonth());
    const holdingPeriodYears = Math.max(0, Math.floor(monthsDiff / 12));
    const holdingPeriodMonths = Math.max(0, monthsDiff % 12);

    // Calculate CAGR
    const daysDiff = Math.max(1, (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const years = daysDiff / 365;
    
    const investmentAmount = Number(holding.investmentAmount) || 0;
    const marketValue = Number(holding.marketValue) || 0;
    
    if (years === 0 || !isFinite(years) || investmentAmount <= 0 || marketValue <= 0 || 
        !isFinite(investmentAmount) || !isFinite(marketValue)) {
      return { cagr: 0, holdingPeriodYears, holdingPeriodMonths };
    }

    const valueRatio = marketValue / investmentAmount;
    if (!isFinite(valueRatio) || valueRatio <= 0) {
      return { cagr: 0, holdingPeriodYears, holdingPeriodMonths };
    }
    
    const cagr = (Math.pow(valueRatio, 1 / years) - 1) * 100;
    
    return { 
      cagr: isFinite(cagr) ? cagr : 0, 
      holdingPeriodYears, 
      holdingPeriodMonths 
    };
  } catch (error: any) {
    // ✅ Never throw - always return defaults on any error
    console.warn(`Error in calculateStockCAGRAndHoldingPeriod for ${holding?.isin || 'unknown'}:`, error?.message || error);
    return { cagr: 0, holdingPeriodYears: 0, holdingPeriodMonths: 0 };
  }
}

function calculateXIRR(transactions: any[], holdings: any[], realizedPL: any[]): number {
  // Portfolio-level XIRR calculation that properly accounts for:
  // 1. Weighted contribution of each stock based on current market value
  // 2. Realized gains/losses from sold positions
  // 3. The timing and duration of investments
  
  if (transactions.length === 0) return 0;
  
  // Sort transactions by date
  const sortedTransactions = [...transactions].sort((a, b) => 
    new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime()
  );
  
  // Calculate weighted average XIRR based on current holdings value
  let weightedXIRRSum = 0;
  let totalCurrentValue = 0;
  
  // For current holdings, calculate weighted contribution
  holdings.forEach(h => {
    const stockTransactions = sortedTransactions.filter(t => t.isin === h.isin);
    if (stockTransactions.length > 0 && h.marketValue > 0) {
      const stockXIRR = calculateStockXIRR(stockTransactions, h);
      // Weight by current market value (market-cap weighted XIRR)
      weightedXIRRSum += stockXIRR * h.marketValue;
      totalCurrentValue += h.marketValue;
    }
  });
  
  // Calculate total invested and withdrawn across all transactions
  const totalInvestedAll = sortedTransactions
    .filter(t => t.buySell === 'BUY')
    .reduce((sum, t) => {
      const tradeValue = t.tradeValueAdjusted || (t.tradePriceAdjusted || 0) * (t.tradedQty || 0) + (t.charges || 0);
      return sum + tradeValue;
    }, 0);
  
  const totalWithdrawn = sortedTransactions
    .filter(t => t.buySell === 'SELL')
    .reduce((sum, t) => {
      const tradeValue = t.tradeValueAdjusted || (t.tradePriceAdjusted || 0) * (t.tradedQty || 0) - (t.charges || 0);
      return sum + tradeValue;
    }, 0);
  
  const totalRealizedPLValue = realizedPL.reduce((sum, r) => sum + (r.realizedProfitLoss || 0), 0);
  
  if (totalCurrentValue === 0) {
    // No current holdings - use cash flow based calculation
    return calculateSimpleXIRR(sortedTransactions, holdings);
  }
  
  // Market-value weighted XIRR from current holdings
  const weightedXIRR = totalCurrentValue > 0 ? weightedXIRRSum / totalCurrentValue : 0;
  
  // Calculate overall portfolio return considering realized P/L
  // Total value = Current holdings + Withdrawn (already realized)
  const totalPortfolioValue = totalCurrentValue + totalWithdrawn;
  const netInvested = totalInvestedAll - totalWithdrawn;
  
  // Calculate time-weighted return
  const firstBuyDate = sortedTransactions
    .filter(t => t.buySell === 'BUY')[0]?.transactionDate;
  
  if (!firstBuyDate) return weightedXIRR;
  
  const years = Math.max(0.01, (new Date().getTime() - new Date(firstBuyDate).getTime()) / (1000 * 60 * 60 * 24 * 365));
  
  // Portfolio-level CAGR: (Total Value / Net Invested)^(1/Years) - 1
  let portfolioCAGR = 0;
  if (netInvested > 0 && totalPortfolioValue > 0 && years > 0) {
    portfolioCAGR = (Math.pow(totalPortfolioValue / netInvested, 1 / years) - 1) * 100;
  } else if (totalInvestedAll > 0 && totalPortfolioValue > 0 && years > 0) {
    portfolioCAGR = (Math.pow(totalPortfolioValue / totalInvestedAll, 1 / years) - 1) * 100;
  }
  
  // Blend weighted XIRR (from current holdings) with portfolio CAGR
  // This gives more accurate portfolio-level returns
  // If portfolio CAGR is significantly different, it likely means timing of investments matters
  if (Math.abs(weightedXIRR - portfolioCAGR) > 5) {
    // Use 60% weighted XIRR, 40% portfolio CAGR
    return weightedXIRR * 0.6 + portfolioCAGR * 0.4;
  }
  
  // If they're close, use weighted XIRR as it better reflects current holdings performance
  return weightedXIRR;
}

function calculateSimpleXIRR(transactions: any[], holdings: any[]): number {
  // Fallback calculation for portfolios with no current holdings
  const cashFlows: Array<{date: Date, amount: number}> = [];
  
  transactions.forEach(t => {
    if (t.buySell === 'BUY') {
      const tradeValue = t.tradeValueAdjusted || (t.tradePriceAdjusted || 0) * (t.tradedQty || 0) + (t.charges || 0);
      if (tradeValue > 0) {
        cashFlows.push({ date: new Date(t.transactionDate), amount: -tradeValue });
      }
    } else if (t.buySell === 'SELL') {
      const tradeValue = t.tradeValueAdjusted || (t.tradePriceAdjusted || 0) * (t.tradedQty || 0) - (t.charges || 0);
      if (tradeValue > 0) {
        cashFlows.push({ date: new Date(t.transactionDate), amount: tradeValue });
      }
    }
  });

  const currentValue = holdings.reduce((sum, h) => sum + (h.marketValue || 0), 0);
  if (currentValue > 0) {
    cashFlows.push({ date: new Date(), amount: currentValue });
  }

  if (cashFlows.length < 2) return 0;
  
  const negativeFlows = cashFlows.filter(cf => cf.amount < 0);
  const positiveFlows = cashFlows.filter(cf => cf.amount > 0);
  
  if (negativeFlows.length === 0 || positiveFlows.length === 0) return 0;
  
  const totalInvested = Math.abs(negativeFlows.reduce((sum, cf) => sum + cf.amount, 0));
  const totalWithdrawn = positiveFlows.filter(cf => cf.date < new Date()).reduce((sum, cf) => sum + cf.amount, 0);
  const currentPortfolioValue = cashFlows[cashFlows.length - 1]?.amount || 0;
  
  if (totalInvested === 0) return 0;
  
  const netInvested = totalInvested - totalWithdrawn;
  const effectiveInvested = netInvested > 0 ? netInvested : totalInvested;
  
  const firstDate = negativeFlows[0].date;
  const lastDate = new Date();
  const daysDiff = Math.max(1, (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
  const years = daysDiff / 365;
  
  if (years === 0) return 0;
  
  const totalValue = currentPortfolioValue + totalWithdrawn;
  const returnRatio = totalValue / effectiveInvested;
  
  if (returnRatio <= 0) return 0;
  
  const annualizedReturn = (Math.pow(returnRatio, 1 / years) - 1) * 100;
  
  return annualizedReturn || 0;
}

function calculateMonthlyInvestments(transactions: any[]): Array<{
  month: string, 
  investments: number, 
  withdrawals: number,
  investmentDetails: Array<{stockName: string, qty: number, amount: number}>,
  withdrawalDetails: Array<{stockName: string, qty: number, amount: number}>
}> {
  const monthlyMap: { 
    [key: string]: { 
      investments: number, 
      withdrawals: number, 
      sortKey: number,
      investmentDetails: Array<{stockName: string, qty: number, amount: number}>,
      withdrawalDetails: Array<{stockName: string, qty: number, amount: number}>
    } 
  } = {};
  
  transactions.forEach(t => {
    const date = new Date(t.transactionDate);
    const month = format(date, 'MMM-yy'); // e.g., "Mar-16"
    const sortKey = date.getTime();
    
    // Skip dividend transactions
    const buySellUpper = (t.buySell || '').toUpperCase();
    if (buySellUpper.includes('DIVIDEND')) {
      return;
    }
    
    // Calculate trade value if not present: price * qty + charges
    let tradeValue = t.tradeValueAdjusted || 0;
    if (tradeValue === 0 && t.tradePriceAdjusted && t.tradedQty) {
      tradeValue = (t.tradePriceAdjusted * t.tradedQty) + (t.charges || 0);
    }
    
    const qty = t.tradedQty || 0;
    const stockName = t.stockName || 'Unknown';
    
    if (!monthlyMap[month]) {
      monthlyMap[month] = { 
        investments: 0, 
        withdrawals: 0, 
        sortKey,
        investmentDetails: [],
        withdrawalDetails: []
      };
    }
    
    if (t.buySell === 'BUY') {
      monthlyMap[month].investments += tradeValue;
      
      // Group by stock name - accumulate quantities and amounts
      const existingStock = monthlyMap[month].investmentDetails.find(d => d.stockName === stockName);
      if (existingStock) {
        existingStock.qty += qty;
        existingStock.amount += tradeValue;
      } else {
        monthlyMap[month].investmentDetails.push({
          stockName,
          qty,
          amount: tradeValue
        });
      }
    } else if (t.buySell === 'SELL') {
      monthlyMap[month].withdrawals += tradeValue;
      
      // Group by stock name - accumulate quantities and amounts
      const existingStock = monthlyMap[month].withdrawalDetails.find(d => d.stockName === stockName);
      if (existingStock) {
        existingStock.qty += qty;
        existingStock.amount += tradeValue;
      } else {
        monthlyMap[month].withdrawalDetails.push({
          stockName,
          qty,
          amount: tradeValue
        });
      }
    }
  });

  return Object.entries(monthlyMap)
    .map(([month, data]) => ({ 
      month, 
      investments: data.investments, 
      withdrawals: data.withdrawals, 
      sortKey: data.sortKey,
      investmentDetails: data.investmentDetails.sort((a, b) => b.amount - a.amount), // Sort by amount descending
      withdrawalDetails: data.withdrawalDetails.sort((a, b) => b.amount - a.amount) // Sort by amount descending
    }))
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(({ month, investments, withdrawals, investmentDetails, withdrawalDetails }) => ({ 
      month, 
      investments, 
      withdrawals,
      investmentDetails,
      withdrawalDetails
    }));
}

function calculateMonthlyDividends(transactions: any[]): Array<{month: string, amount: number, stockDetails: Array<{stockName: string, amount: number}>}> {
  const monthlyMap: { [key: string]: { amount: number, sortKey: number, stockDetails: Map<string, number> } } = {};
  
  transactions.forEach(t => {
    const buySellUpper = (t.buySell || '').toUpperCase();
    if (buySellUpper.includes('DIVIDEND')) {
      const date = new Date(t.transactionDate);
      const month = format(date, 'MMM-yy'); // e.g., "Mar-16"
      const sortKey = date.getTime();
      
      // Calculate trade value if not present: price * qty
      let tradeValue = t.tradeValueAdjusted || 0;
      if (tradeValue === 0 && t.tradePriceAdjusted && t.tradedQty) {
        tradeValue = t.tradePriceAdjusted * t.tradedQty;
      }
      
      if (!monthlyMap[month]) {
        monthlyMap[month] = { amount: 0, sortKey, stockDetails: new Map() };
      }
      monthlyMap[month].amount += tradeValue;
      
      // Track dividend by stock name
      const stockName = t.stockName || 'Unknown';
      const currentAmount = monthlyMap[month].stockDetails.get(stockName) || 0;
      monthlyMap[month].stockDetails.set(stockName, currentAmount + tradeValue);
    }
  });

  return Object.entries(monthlyMap)
    .map(([month, data]) => ({ 
      month, 
      amount: data.amount, 
      sortKey: data.sortKey,
      stockDetails: Array.from(data.stockDetails.entries())
        .map(([stockName, amount]) => ({ stockName, amount }))
        .sort((a, b) => b.amount - a.amount) // Sort by amount descending
    }))
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(({ month, amount, stockDetails }) => ({ month, amount, stockDetails }));
}

async function calculateMonthlyReturns(holdings: any[], transactions: any[]): Promise<Array<{month: string, returnPercent: number, returnAmount: number}>> {
  // Calculate monthly returns based on actual stock price movements using historical OHLC data
  const monthlyReturns: Array<{month: string, returnPercent: number, returnAmount: number, sortKey: number}> = [];
  
  if (transactions.length === 0 && holdings.length === 0) return [];
  
  // Get all months from transactions
  const allDates: Date[] = [];
  transactions.forEach(t => {
    allDates.push(new Date(t.transactionDate));
  });
  holdings.forEach(h => {
    if (h.asOnDate) allDates.push(new Date(h.asOnDate));
  });
  
  if (allDates.length === 0) return [];
  
  // Only show last 5 years of data
  const maxDate = new Date();
  const fiveYearsAgo = subYears(maxDate, 5);
  const minDate = startOfMonth(fiveYearsAgo);
  
  // Generate all months for the last 5 years only
  const months: Date[] = [];
  let current = new Date(minDate);
  while (current <= maxDate) {
    months.push(new Date(current));
    const nextMonth = new Date(current);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    current = nextMonth;
  }
  
  // Track holdings quantity over time from transactions
  const holdingsOverTime: { [isin: string]: { [monthKey: string]: number } } = {};
  
  // Initialize with current holdings
  holdings.forEach(h => {
    if (!holdingsOverTime[h.isin]) holdingsOverTime[h.isin] = {};
  });
  
  // Process transactions chronologically to build holdings quantity per month
  const sortedTransactions = [...transactions].sort((a, b) => 
    new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime()
  );
  
  // Get unique ISINs from holdings
  const uniqueIsins = [...new Set(holdings.map(h => h.isin).filter(Boolean))];
  
  // OPTIMIZED: Use MongoDB aggregation to fetch ALL prices in ONE query (much faster)
  const StockData = (await import('@/models/StockData')).default;
  const priceDataMap = new Map<string, Array<{ date: Date; close: number }>>();
  
  console.log(`📊 Fetching stock prices for ${uniqueIsins.length} ISINs for monthly returns calculation (using aggregation)...`);
  
  try {
    // Fetch all prices for all ISINs in one aggregation query
    const allPrices: any[] = await StockData.aggregate([
      {
        $match: {
          isin: { $in: uniqueIsins },
          date: { $gte: minDate }
        }
      },
      {
        $sort: { isin: 1, date: 1 }
      },
      {
        $project: {
          isin: 1,
          date: 1,
          close: 1
        }
      }
    ]).exec();
    
    // Group prices by ISIN
    allPrices.forEach((p: any) => {
      if (!priceDataMap.has(p.isin)) {
        priceDataMap.set(p.isin, []);
      }
      priceDataMap.get(p.isin)!.push({
        date: new Date(p.date),
        close: p.close || 0
      });
    });
    
    console.log(`✅ Fetched price data for ${priceDataMap.size} ISINs. Data points: ${Array.from(priceDataMap.values()).reduce((sum, arr) => sum + arr.length, 0)}`);
  } catch (error) {
    console.error(`Error in aggregation query, falling back to batch queries:`, error);
    // Fallback to batch processing if aggregation fails
    const BATCH_SIZE = 20;
    for (let i = 0; i < uniqueIsins.length; i += BATCH_SIZE) {
      const batch = uniqueIsins.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (isin) => {
        try {
          const prices = await StockData.find({ 
            isin,
            date: { $gte: minDate }
          })
            .sort({ date: 1 })
            .select('date close')
            .lean();
          
          if (prices.length > 0) {
            priceDataMap.set(isin, prices.map((p: any) => ({
              date: new Date(p.date),
              close: p.close || 0
            })));
          }
        } catch (err) {
          priceDataMap.set(isin, []);
        }
      }));
    }
  }
  
  // Helper function to get price from cached data
  const getCachedPrice = (isin: string, targetDate: Date): number => {
    const prices = priceDataMap.get(isin) || [];
    if (prices.length === 0) return 0;
    
    // Find closest date
    let closestPrice = 0;
    let minDiff = Infinity;
    
    for (const item of prices) {
      const diff = Math.abs(item.date.getTime() - targetDate.getTime());
      if (diff < minDiff) {
        minDiff = diff;
        closestPrice = item.close;
      }
    }
    
    return closestPrice;
  };
  
  // Helper function to calculate XIRR up to a specific date (XIRR as of end of that month)
  // This calculates cumulative XIRR from first transaction up to the end of the specified month
  const calculateXIRRUpToDate = (upToDate: Date): number => {
    // Get all transactions up to and including this date
    const transactionsUpToDate = sortedTransactions.filter(t => 
      new Date(t.transactionDate) <= upToDate
    );
    
    if (transactionsUpToDate.length === 0) return 0;
    
    // Get first transaction date (start of investment period)
    const firstTxnDate = transactionsUpToDate[0]?.transactionDate;
    if (!firstTxnDate) return 0;
    
    // Calculate time period in years from first transaction to end of this month
    const daysDiff = (upToDate.getTime() - new Date(firstTxnDate).getTime()) / (1000 * 60 * 60 * 24);
    const years = daysDiff / 365;
    
    // Need at least 30 days to calculate meaningful XIRR
    if (years < 30 / 365) return 0;
    
    // Calculate holdings quantity as of this date (based ONLY on transactions up to this date)
    const holdingsAtDate: { [isin: string]: number } = {};
    
    // Process transactions chronologically to get holdings quantity at this date
    transactionsUpToDate.forEach(txn => {
      const qtyChange = txn.buySell === 'BUY' ? txn.tradedQty : -txn.tradedQty;
      holdingsAtDate[txn.isin] = (holdingsAtDate[txn.isin] || 0) + qtyChange;
    });
    
    // Only consider stocks with positive quantity (still held at this date)
    // Do NOT include current holdings - only use what existed at this point in time
    
    // Calculate portfolio value at end of this month using stock prices on that date
    let portfolioValue = 0;
    for (const [isin, qty] of Object.entries(holdingsAtDate)) {
      if (qty > 0) {
        const price = getCachedPrice(isin, upToDate);
        portfolioValue += price * qty;
      }
    }
    
    // Calculate total invested up to this date (all BUY transactions)
    const totalInvested = transactionsUpToDate
      .filter(t => t.buySell === 'BUY')
      .reduce((sum, t) => {
        const tradeValue = t.tradeValueAdjusted || (t.tradePriceAdjusted || 0) * (t.tradedQty || 0) + (t.charges || 0);
        return sum + tradeValue;
      }, 0);
    
    // Calculate total withdrawn up to this date (all SELL transactions)
    const totalWithdrawn = transactionsUpToDate
      .filter(t => t.buySell === 'SELL')
      .reduce((sum, t) => {
        const tradeValue = t.tradeValueAdjusted || (t.tradePriceAdjusted || 0) * (t.tradedQty || 0) - (t.charges || 0);
        return sum + tradeValue;
      }, 0);
    
    // Net invested = Total invested - Total withdrawn (money still in portfolio)
    const netInvested = totalInvested - totalWithdrawn;
    
    // Total portfolio value = Current holdings value + Money withdrawn
    const totalPortfolioValue = portfolioValue + totalWithdrawn;
    
    if (netInvested <= 0 || totalPortfolioValue <= 0) return 0;
    
    // Calculate CAGR as cumulative XIRR from first transaction to end of this month
    // Formula: (Total Portfolio Value / Net Invested)^(1/Years) - 1
    let xirr = 0;
    if (years > 0 && netInvested > 0 && totalPortfolioValue > 0) {
      const ratio = totalPortfolioValue / netInvested;
      if (ratio > 0) {
        xirr = (Math.pow(ratio, 1 / years) - 1) * 100;
      }
    }
    
    // Cap XIRR at reasonable bounds to prevent unrealistic values
    // For very short periods, the annualized return can be extreme, so we cap it
    if (years < 1) {
      // For periods less than 1 year, cap more aggressively (-100% to +500%)
      xirr = Math.max(-100, Math.min(500, xirr));
    } else {
      // For periods >= 1 year, allow wider range but still cap (-100% to +200%)
      xirr = Math.max(-100, Math.min(200, xirr));
    }
    
    return xirr;
  };
  
  // Calculate portfolio value for each month
  for (const monthStart of months) {
    const monthEnd = endOfMonth(monthStart);
    const month = format(monthStart, 'MMM-yy');
    const sortKey = monthStart.getTime();
    
    // Calculate holdings quantity at the start of this month
    const holdingsAtMonthStart: { [isin: string]: number } = {};
    
    // Process all transactions up to this month to determine quantities
    for (const txn of sortedTransactions) {
      const txnDate = new Date(txn.transactionDate);
      if (txnDate > monthStart) break; // Only process transactions up to this month
      
      const qtyChange = txn.buySell === 'BUY' ? txn.tradedQty : -txn.tradedQty;
      holdingsAtMonthStart[txn.isin] = (holdingsAtMonthStart[txn.isin] || 0) + qtyChange;
    }
    
    // Also include current holdings for stocks not in transactions
    holdings.forEach(h => {
      if (!holdingsAtMonthStart[h.isin]) {
        holdingsAtMonthStart[h.isin] = h.openQty || 0;
      }
    });
    
    // Calculate portfolio value at start and end of month using actual stock prices
    let portfolioValueStart = 0;
    let portfolioValueEnd = 0;
    
    for (const [isin, qty] of Object.entries(holdingsAtMonthStart)) {
      if (qty <= 0) continue;
      
      // Get stock price at start and end of month from historical data
      const priceStart = getCachedPrice(isin, monthStart);
      const priceEnd = getCachedPrice(isin, monthEnd);
      
      if (priceStart > 0 && priceEnd > 0) {
        portfolioValueStart += priceStart * qty;
        portfolioValueEnd += priceEnd * qty;
      } else if (priceStart > 0) {
        // If we only have start price, use it for both
        portfolioValueStart += priceStart * qty;
        portfolioValueEnd += priceStart * qty;
      }
    }
    
    // Calculate return
    let returnPercent = 0;
    const returnAmount = portfolioValueEnd - portfolioValueStart;
    
    if (portfolioValueStart > 0) {
      returnPercent = ((portfolioValueEnd - portfolioValueStart) / portfolioValueStart) * 100;
      // Cap at reasonable values
      returnPercent = Math.max(-100, Math.min(200, returnPercent));
    }
    
    monthlyReturns.push({ month, returnPercent, returnAmount, sortKey });
  }
  
  // Sort by date
  return monthlyReturns
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(({ month, returnPercent, returnAmount }) => ({ month, returnPercent, returnAmount }));
}

/**
 * Get stock price for a specific date (closest available date)
 */
// Cache for stock prices to avoid repeated queries
const stockPriceCache = new Map<string, { date: Date; price: number }[]>();

/**
 * Get stock price for a specific date (closest available date)
 * Uses caching to improve performance
 */
async function getStockPriceForDate(isin: string, date: Date): Promise<number> {
  try {
    // Normalize date to start of day
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);
    
    const cacheKey = `${isin}`;
    
    // Check cache first - if we have data for this ISIN, use it
    if (!stockPriceCache.has(cacheKey)) {
      // Fetch all prices for this ISIN once and cache them
      const StockData = (await import('@/models/StockData')).default;
      const allPrices: any[] = await StockData.find({ isin })
        .sort({ date: 1 })
        .select('date close')
        .lean();
      
      stockPriceCache.set(cacheKey, allPrices.map(p => ({
        date: new Date(p.date),
        price: p.close || 0
      })));
    }
    
    const cachedPrices = stockPriceCache.get(cacheKey) || [];
    
    // Find closest price in cache
    let closestPrice = 0;
    let minDiff = Infinity;
    
    for (const item of cachedPrices) {
      const diff = Math.abs(item.date.getTime() - normalizedDate.getTime());
      if (diff < minDiff) {
        minDiff = diff;
        closestPrice = item.price;
      }
    }
    
    return closestPrice;
  } catch (error) {
    console.error(`Error getting stock price for ${isin} on ${format(date, 'yyyy-MM-dd')}:`, error);
    return 0;
  }
}

function calculateReturnStatistics(
  monthlyReturns: Array<{month: string, returnPercent: number, returnAmount: number}>,
  transactions: any[],
  holdings: any[],
  currentValue: number,
  totalInvested: number
): {
  xirr: number,
  cagr: number,
  avgReturnOverall: { percent: number, amount: number },
  avgReturnCurrentYear: { percent: number, amount: number },
  bestMonthCurrentYear: { month: string, percent: number, amount: number },
  worstMonthCurrentYear: { month: string, percent: number, amount: number }
} {
  // Calculate XIRR
  const xirr = calculateXIRR(transactions, holdings, []);
  
  // Calculate CAGR (Compound Annual Growth Rate)
  // Use net invested (total invested minus withdrawals) for more accurate calculation
  let cagr = 0;
  if (transactions.length > 0) {
    // Calculate total invested and withdrawn
    const totalInvestedAll = transactions
      .filter(t => t.buySell === 'BUY')
      .reduce((sum, t) => {
        const tradeValue = t.tradeValueAdjusted || (t.tradePriceAdjusted || 0) * (t.tradedQty || 0) + (t.charges || 0);
        return sum + tradeValue;
      }, 0);
    
    const totalWithdrawn = transactions
      .filter(t => t.buySell === 'SELL')
      .reduce((sum, t) => {
        const tradeValue = t.tradeValueAdjusted || (t.tradePriceAdjusted || 0) * (t.tradedQty || 0) - (t.charges || 0);
        return sum + tradeValue;
      }, 0);
    
    const netInvested = totalInvestedAll - totalWithdrawn;
    const totalPortfolioValue = currentValue + totalWithdrawn; // Current value + withdrawn money
    
    // Find first investment date
    const firstTransaction = transactions
      .filter(t => t.buySell === 'BUY')
      .sort((a, b) => new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime())[0];
    
    if (firstTransaction && (netInvested > 0 || totalInvestedAll > 0)) {
      const startDate = new Date(firstTransaction.transactionDate);
      const endDate = new Date();
      const daysDiff = Math.max(1, (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const years = daysDiff / 365;
      
      if (years > 0) {
        // CAGR = (Total Value / Net Invested)^(1/Years) - 1
        // Total Value includes current holdings + withdrawn money
        const effectiveInvested = netInvested > 0 ? netInvested : totalInvestedAll;
        if (effectiveInvested > 0 && totalPortfolioValue > 0) {
          cagr = (Math.pow(totalPortfolioValue / effectiveInvested, 1 / years) - 1) * 100;
        }
      }
    }
  }

  if (monthlyReturns.length === 0) {
    return {
      xirr,
      cagr,
      avgReturnOverall: { percent: 0, amount: 0 },
      avgReturnCurrentYear: { percent: 0, amount: 0 },
      bestMonthCurrentYear: { month: '', percent: 0, amount: 0 },
      worstMonthCurrentYear: { month: '', percent: 0, amount: 0 },
    };
  }

  // Calculate overall average
  const totalReturnPercent = monthlyReturns.reduce((sum, r) => sum + r.returnPercent, 0);
  const totalReturnAmount = monthlyReturns.reduce((sum, r) => sum + r.returnAmount, 0);
  const avgReturnOverall = {
    percent: totalReturnPercent / monthlyReturns.length,
    amount: totalReturnAmount / monthlyReturns.length,
  };

  // Filter current year data (last 12 months or from start of current year)
  const currentYearStart = startOfYear(new Date());
  const currentYearReturns = monthlyReturns.filter(r => {
    // Parse month string (MMM-yy) to date
    try {
      const [monthStr, yearStr] = r.month.split('-');
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthIndex = monthNames.indexOf(monthStr);
      const year = 2000 + parseInt(yearStr); // Convert yy to yyyy
      const returnDate = new Date(year, monthIndex, 1);
      return returnDate >= currentYearStart;
    } catch {
      return false;
    }
  });

  // Calculate current year average
  let avgReturnCurrentYear = { percent: 0, amount: 0 };
  if (currentYearReturns.length > 0) {
    const currentYearTotalPercent = currentYearReturns.reduce((sum, r) => sum + r.returnPercent, 0);
    const currentYearTotalAmount = currentYearReturns.reduce((sum, r) => sum + r.returnAmount, 0);
    avgReturnCurrentYear = {
      percent: currentYearTotalPercent / currentYearReturns.length,
      amount: currentYearTotalAmount / currentYearReturns.length,
    };
  }

  // Find best and worst months of current year
  let bestMonthCurrentYear = { month: '', percent: 0, amount: 0 };
  let worstMonthCurrentYear = { month: '', percent: 0, amount: 0 };
  
  if (currentYearReturns.length > 0) {
    // Sort by return percent to find best and worst
    const sortedByPercent = [...currentYearReturns].sort((a, b) => b.returnPercent - a.returnPercent);
    bestMonthCurrentYear = {
      month: sortedByPercent[0].month,
      percent: sortedByPercent[0].returnPercent,
      amount: sortedByPercent[0].returnAmount,
    };
    worstMonthCurrentYear = {
      month: sortedByPercent[sortedByPercent.length - 1].month,
      percent: sortedByPercent[sortedByPercent.length - 1].returnPercent,
      amount: sortedByPercent[sortedByPercent.length - 1].returnAmount,
    };
  }

  return {
    xirr,
    cagr,
    avgReturnOverall,
    avgReturnCurrentYear,
    bestMonthCurrentYear,
    worstMonthCurrentYear,
  };
}

function calculateIndustryDistribution(
  holdings: any[], 
  transactions: any[], 
  monthlyReturns: Array<{month: string, returnPercent: number, returnAmount: number}>
): Array<{
  sector: string, 
  percentage: number, 
  amount: number,
  xirr: number,
  cagr: number,
  overallReturnPercent: number,
  profitLossPercent: number,
  profitLossAmount: number
}> {
  const sectorMap: { [key: string]: { holdings: any[], marketValue: number, invested: number, profitLoss: number } } = {};
  const totalValue = holdings.reduce((sum, h) => sum + (h.marketValue || 0), 0);
  
  // Group holdings by sector
  holdings.forEach(h => {
    const sector = h.sectorName || 'Unknown';
    if (!sectorMap[sector]) {
      sectorMap[sector] = { holdings: [], marketValue: 0, invested: 0, profitLoss: 0 };
    }
    sectorMap[sector].holdings.push(h);
    sectorMap[sector].marketValue += (h.marketValue || 0);
    sectorMap[sector].invested += (h.investmentAmount || 0);
    sectorMap[sector].profitLoss += (h.profitLossTillDate || 0);
  });

  // Calculate metrics for each sector
  return Object.entries(sectorMap)
    .map(([sector, data]) => {
      const amount = data.marketValue;
      const invested = data.invested;
      const profitLoss = data.profitLoss;
      
      // Calculate P/L % and Amount
      const profitLossPercent = invested > 0 ? (profitLoss / invested) * 100 : 0;
      const profitLossAmount = profitLoss;
      
      // Calculate Overall Return % (Current Value - Invested) / Invested * 100
      const overallReturnPercent = invested > 0 ? ((amount - invested) / invested) * 100 : 0;
      
      // Calculate XIRR for this sector
      const sectorTransactions = transactions.filter(t => {
        const holding = data.holdings.find(h => h.isin === t.isin);
        return holding !== undefined;
      });
      const sectorXIRR = calculateXIRR(sectorTransactions, data.holdings, []);
      
      // Calculate CAGR for this sector
      let sectorCAGR = 0;
      if (sectorTransactions.length > 0 && invested > 0 && amount > 0) {
        const firstTransaction = sectorTransactions
          .filter(t => t.buySell === 'BUY')
          .sort((a, b) => new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime())[0];
        
        if (firstTransaction) {
          const startDate = new Date(firstTransaction.transactionDate);
          const endDate = new Date();
          const daysDiff = Math.max(1, (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
          const years = daysDiff / 365;
          
          if (years > 0) {
            sectorCAGR = (Math.pow(amount / invested, 1 / years) - 1) * 100;
          }
        }
      }

      return {
        sector,
        amount,
        percentage: totalValue > 0 ? (amount / totalValue) * 100 : 0,
        xirr: sectorXIRR,
        cagr: sectorCAGR,
        overallReturnPercent,
        profitLossPercent,
        profitLossAmount,
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Calculate realized stocks (stocks that were bought and fully sold)
 * Shows what they would be worth today if held
 */
async function calculateRealizedStocks(transactions: any[], currentHoldings: any[]): Promise<Array<{
  stockName: string;
  sectorName: string;
  isin: string;
  qtySold: number;
  avgCost: number;
  avgSoldPrice: number;
  totalInvested: number;
  lastSoldDate: Date;
  currentPrice: number;
  currentValue: number;
  realizedPL: number;
  unrealizedPL: number;
  totalPL: number;
  totalPLPercent: number;
  xirr: number;
  cagr: number;
  holdingPeriodYears: number;
  holdingPeriodMonths: number;
  holdingPeriodDays: number;
}>> {
  if (!transactions || transactions.length === 0) return [];
  
  try {
    // Get ISINs of current holdings
    const currentHoldingsIsins = new Set((currentHoldings || []).map((h: any) => h?.isin).filter(Boolean));
    
    // Group transactions by ISIN
    const stockTransactions: { [isin: string]: any[] } = {};
  transactions.forEach(t => {
    if (!t.isin) return;
    if (!stockTransactions[t.isin]) {
      stockTransactions[t.isin] = [];
    }
    stockTransactions[t.isin].push(t);
  });
  
  const realizedStocksData: Array<{
    stockName: string;
    sectorName: string;
    isin: string;
    qtySold: number;
    avgCost: number;
    avgSoldPrice: number;
    totalInvested: number;
    lastSoldDate: Date;
    currentPrice: number;
    currentValue: number;
    realizedPL: number;
    unrealizedPL: number;
    totalPL: number;
    totalPLPercent: number;
    xirr: number;
    cagr: number;
    holdingPeriodYears: number;
    holdingPeriodMonths: number;
    holdingPeriodDays: number;
  }> = [];
  
  // Find stocks that were fully sold (have SELL transactions but not in current holdings)
  for (const [isin, stockTxns] of Object.entries(stockTransactions)) {
    // Skip if stock is still in current holdings
    if (currentHoldingsIsins.has(isin)) continue;
    
    const buyTransactions = stockTxns.filter(t => t.buySell === 'BUY');
    const sellTransactions = stockTxns.filter(t => t.buySell === 'SELL');
    
    // Must have both buy and sell transactions
    if (buyTransactions.length === 0 || sellTransactions.length === 0) continue;
    
    // Calculate total bought and sold
    let totalBoughtQty = 0;
    let totalInvested = 0;
    let totalSoldQty = 0;
    let totalRealized = 0;
    
    buyTransactions.forEach(t => {
      const qty = t.tradedQty || 0;
      const tradeValue = t.tradeValueAdjusted || (t.tradePriceAdjusted || 0) * qty + (t.charges || 0);
      totalBoughtQty += qty;
      totalInvested += tradeValue;
    });
    
    let totalSoldValue = 0;
    sellTransactions.forEach(t => {
      const qty = t.tradedQty || 0;
      const tradeValue = t.tradeValueAdjusted || (t.tradePriceAdjusted || 0) * qty - (t.charges || 0);
      totalSoldQty += qty;
      totalRealized += tradeValue;
      
      // Calculate sold price: use tradePriceAdjusted if available, otherwise calculate from tradeValue
      if (t.tradePriceAdjusted && t.tradePriceAdjusted > 0) {
        totalSoldValue += t.tradePriceAdjusted * qty;
      } else if (tradeValue > 0 && qty > 0) {
        // Calculate average price from trade value (excluding charges for SELL)
        const priceWithoutCharges = (tradeValue + (t.charges || 0)) / qty;
        totalSoldValue += priceWithoutCharges * qty;
      }
    });
    const avgSoldPrice = totalSoldQty > 0 && totalSoldValue > 0 ? totalSoldValue / totalSoldQty : 0;
    
    // Only include if fully sold (sold qty >= bought qty)
    if (totalSoldQty < totalBoughtQty) continue;
    
    // Get stock name and sector from first transaction or StockMaster
    const firstTxn = buyTransactions[0];
    let stockName = firstTxn.stockName || '';
    let sectorName = firstTxn.sectorName || 'Unknown';
    
    // Try to get from StockMaster (connectDB is already called at the top level)
    try {
      const StockMaster = (await import('@/models/StockMaster')).default;
      const stockMaster: any = await StockMaster.findOne({ isin }).lean();
      if (stockMaster && stockMaster.stockName) {
        stockName = stockMaster.stockName || stockName;
        // sectorName might not be in StockMaster, keep from transaction
      }
    } catch (error) {
      console.error(`Error fetching stock master for ${isin}:`, error);
    }
    
    // Get current price from database (will be 0 if not available)
    const currentPrice = await getCurrentStockPrice(isin);
    const qtySold = totalBoughtQty; // Total quantity that was held and sold
    const currentValue = currentPrice > 0 ? currentPrice * qtySold : 0;
    const avgCost = totalInvested / qtySold;
    const realizedPL = totalRealized - totalInvested;
    // Unrealized P/L: What it would be worth today if held (only calculate if we have current price)
    const unrealizedPL = currentPrice > 0 ? currentValue - totalInvested : 0;
    const totalPL = totalRealized - totalInvested; // Actual realized P/L
    const totalPLPercent = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;
    
    // Get last sell date
    const lastSellDate = sellTransactions
      .sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime())[0]
      .transactionDate;
    
    // Calculate XIRR and CAGR for the holding period
    const firstBuyDate = buyTransactions
      .sort((a, b) => new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime())[0]
      .transactionDate;
    
    const daysDiff = Math.max(1, (new Date(lastSellDate).getTime() - new Date(firstBuyDate).getTime()) / (1000 * 60 * 60 * 24));
    const years = daysDiff / 365;
    const totalDays = Math.floor(daysDiff);
    
    // Calculate holding period - show days if less than a month
    let holdingPeriodYears = 0;
    let holdingPeriodMonths = 0;
    let holdingPeriodDays = 0;
    
    if (totalDays < 30) {
      // Less than a month - show days only
      holdingPeriodDays = totalDays;
    } else {
      // Calculate months and years
      const monthsDiff = Math.floor(totalDays / 30);
      holdingPeriodYears = Math.floor(monthsDiff / 12);
      holdingPeriodMonths = monthsDiff % 12;
      holdingPeriodDays = 0; // Not used when we have months/years
    }
    
    // Calculate XIRR (based on actual realized returns)
    let xirr = 0;
    if (years > 0 && totalInvested > 0) {
      const returnRatio = totalRealized / totalInvested;
      xirr = (Math.pow(returnRatio, 1 / years) - 1) * 100;
    }
    
    // Calculate CAGR (what it would have been if held to today)
    let cagr = 0;
    const daysToToday = Math.max(1, (new Date().getTime() - new Date(firstBuyDate).getTime()) / (1000 * 60 * 60 * 24));
    const yearsToToday = daysToToday / 365;
    if (yearsToToday > 0 && totalInvested > 0 && currentValue > 0) {
      cagr = (Math.pow(currentValue / totalInvested, 1 / yearsToToday) - 1) * 100;
    }
    
    realizedStocksData.push({
      stockName,
      sectorName,
      isin,
      qtySold,
      avgCost,
      avgSoldPrice,
      totalInvested,
      lastSoldDate: new Date(lastSellDate),
      currentPrice,
      currentValue,
      realizedPL,
      unrealizedPL,
      totalPL,
      totalPLPercent,
      xirr,
      cagr,
      holdingPeriodYears,
      holdingPeriodMonths,
      holdingPeriodDays,
    });
    }
    
    // Sort by last sold date (most recent first)
    return realizedStocksData.sort((a, b) => {
      const aTime = a.lastSoldDate instanceof Date ? a.lastSoldDate.getTime() : new Date(a.lastSoldDate).getTime();
      const bTime = b.lastSoldDate instanceof Date ? b.lastSoldDate.getTime() : new Date(b.lastSoldDate).getTime();
      return bTime - aTime;
    });
  } catch (error: any) {
    console.error('Error in calculateRealizedStocks:', error);
    console.error('Error stack:', error?.stack);
    return []; // Return empty array on error
  }
}

/**
 * Calculate realized stocks from RealizedProfitLoss collection
 * Aggregates multiple PL records per stock and calculates current value
 */
async function calculateRealizedStocksFromPL(realizedPL: any[], currentHoldings: any[]): Promise<Array<{
  stockName: string;
  sectorName: string;
  isin: string;
  qtySold: number;
  avgCost: number;
  avgSoldPrice: number;
  totalInvested: number;
  lastSoldDate: Date;
  currentPrice: number;
  currentValue: number;
  realizedPL: number;
  unrealizedPL: number;
  totalPL: number;
  totalPLPercent: number;
  xirr: number;
  cagr: number;
  holdingPeriodYears: number;
  holdingPeriodMonths: number;
  holdingPeriodDays: number;
}>> {
  if (!realizedPL || realizedPL.length === 0) {
    console.log(`calculateRealizedStocksFromPL: No realizedPL records provided`);
    return [];
  }
  
  console.log(`calculateRealizedStocksFromPL: Starting with ${realizedPL.length} realized PL records`);
  
  try {
    console.log(`calculateRealizedStocksFromPL: Processing ${realizedPL.length} realized PL records`);
    
    // Get ISINs of current holdings (to exclude stocks still held)
    const currentHoldingsIsins = new Set((currentHoldings || []).map((h: any) => normalizeIsin(h?.isin)).filter(Boolean));
    console.log(`calculateRealizedStocksFromPL: Current holdings ISINs: ${Array.from(currentHoldingsIsins).slice(0, 5).join(', ')}... (${currentHoldingsIsins.size} total)`);
    
    // Check for Ola Electric in current holdings (check both ISIN formats: corrected and original)
    const olaInHoldings = currentHoldings.find((h: any) => 
      String(h.stockName || '').toLowerCase().includes('ola electric') || 
      normalizeIsin(h.isin) === 'INEOLXG01040' ||
      normalizeIsin(h.isin) === 'INE0LXG01040' // Also check original format in case correction didn't happen
    );
    if (olaInHoldings) {
      console.log(`calculateRealizedStocksFromPL: ⚠️  Ola Electric found in current holdings (will be excluded from realized stocks):`, {
        stockName: olaInHoldings.stockName,
        isin: olaInHoldings.isin,
        openQty: olaInHoldings.openQty,
      });
    } else {
      console.log(`calculateRealizedStocksFromPL: ✅ Ola Electric NOT in current holdings (will be included in realized stocks)`);
    }
    
    // Check for Ola Electric specifically in realizedPL (check both ISIN formats)
    const olaElectricInPL = realizedPL.filter((r: any) => 
      String(r.stockName || '').toLowerCase().includes('ola electric') ||
      normalizeIsin(r.isin) === 'INEOLXG01040' ||
      normalizeIsin(r.isin) === 'INE0LXG01040' // Also check original format
    );
    console.log(`calculateRealizedStocksFromPL: Found ${olaElectricInPL.length} Ola Electric records in realizedPL`);
    if (olaElectricInPL.length > 0) {
      olaElectricInPL.slice(0, 3).forEach((r: any, i: number) => {
        console.log(`  ${i + 1}. "${r.stockName}" - ISIN: ${r.isin || 'MISSING'} (normalized: ${normalizeIsin(r.isin)}), closedQty: ${r.closedQty}, sellDate: ${r.sellDate}`);
      });
    }
    
    // Group realized PL records by stock (by ISIN if available, otherwise by stock name)
    const stockMap = new Map<string, {
      stockName: string;
      sectorName: string;
      isin: string;
      totalClosedQty: number;
      totalSellValue: number;
      totalBuyValue: number;
      totalRealizedPL: number;
      lastSellDate: Date | null;
      firstBuyDate: Date | null;
      sellPrices: number[];
      buyPrices: number[];
    }>();
    
    for (const pl of realizedPL) {
      // Log Ola Electric records specifically
      const isOlaElectric = String(pl.stockName || '').toLowerCase().includes('ola electric');
      if (isOlaElectric) {
        console.log(`📊 Processing Ola Electric PL record:`, {
          stockName: pl.stockName,
          isin: pl.isin || 'MISSING',
          closedQty: pl.closedQty,
          sellDate: pl.sellDate,
          buyDate: pl.buyDate,
          realizedPL: pl.realizedProfitLoss,
        });
      }
      
      // Skip if stock is still in current holdings (but only if we have a valid ISIN match)
      const plIsin = normalizeIsin(pl.isin || '');
      if (plIsin && currentHoldingsIsins.has(plIsin)) {
        if (isOlaElectric) {
          console.log(`⚠️  Skipping Ola Electric - still in current holdings (ISIN: ${plIsin})`);
        }
        continue; // Stock still held, not realized
      }
      
      // Use ISIN if available, otherwise use stock name as key
      const stockNameKey = String(pl.stockName || '').trim().toLowerCase();
      const key = plIsin || stockNameKey;
      if (!key || !stockNameKey) {
        if (isOlaElectric) {
          console.error(`❌ Skipping Ola Electric - no key available`);
        }
        continue;
      }
      
      if (!stockMap.has(key)) {
        stockMap.set(key, {
          stockName: String(pl.stockName || '').trim(),
          sectorName: String(pl.sectorName || '').trim() || 'Unknown',
          isin: plIsin,
          totalClosedQty: 0,
          totalSellValue: 0,
          totalBuyValue: 0,
          totalRealizedPL: 0,
          lastSellDate: null as Date | null,
          firstBuyDate: null as Date | null,
          sellPrices: [],
          buyPrices: [],
        });
        if (isOlaElectric) {
          console.log(`✅ Created new stock entry for Ola Electric (key: ${key})`);
        }
      }
      
      const stockData = stockMap.get(key)!;
      stockData.totalClosedQty += Number(pl.closedQty || 0);
      stockData.totalSellValue += Number(pl.sellValue || 0);
      stockData.totalBuyValue += Number(pl.buyValue || 0);
      stockData.totalRealizedPL += Number(pl.realizedProfitLoss || 0);
      
      // Track dates - fix initialization
      const sellDate = pl.sellDate ? new Date(pl.sellDate) : null;
      const buyDate = pl.buyDate ? new Date(pl.buyDate) : null;
      
      if (sellDate && !isNaN(sellDate.getTime())) {
        if (!stockData.lastSellDate || sellDate > stockData.lastSellDate) {
          stockData.lastSellDate = sellDate;
        }
      }
      
      if (buyDate && !isNaN(buyDate.getTime())) {
        if (!stockData.firstBuyDate || buyDate < stockData.firstBuyDate) {
          stockData.firstBuyDate = buyDate;
        }
      }
      
      // Track prices for averaging
      if (pl.sellPrice && Number(pl.sellPrice) > 0) {
        stockData.sellPrices.push(Number(pl.sellPrice));
      }
      if (pl.buyPrice && Number(pl.buyPrice) > 0) {
        stockData.buyPrices.push(Number(pl.buyPrice));
      }
    }
    
    // Convert map to array and calculate metrics
    const realizedStocksData: Array<{
      stockName: string;
      sectorName: string;
      isin: string;
      qtySold: number;
      avgCost: number;
      avgSoldPrice: number;
      totalInvested: number;
      lastSoldDate: Date;
      currentPrice: number;
      currentValue: number;
      realizedPL: number;
      unrealizedPL: number;
      totalPL: number;
      totalPLPercent: number;
      xirr: number;
      cagr: number;
      holdingPeriodYears: number;
      holdingPeriodMonths: number;
      holdingPeriodDays: number;
    }> = [];
    
    for (const [key, stockData] of stockMap.entries()) {
      const isOlaElectric = stockData.stockName.toLowerCase().includes('ola electric');
      
      // CRITICAL: Don't skip stocks with zero closed quantity if they have realized P&L
      // Some stocks might have closedQty=0 but still have realized P&L (e.g., partial sales)
      if (stockData.totalClosedQty <= 0 && stockData.totalRealizedPL === 0) {
        if (isOlaElectric) {
          console.error(`❌ Skipping Ola Electric - no closed quantity and no realized P/L`);
        }
        continue; // Skip only if both are zero
      }
      
      // Log if we're processing a stock with zero closed quantity but has realized P/L
      if (stockData.totalClosedQty <= 0 && stockData.totalRealizedPL !== 0) {
        console.warn(`⚠️  Processing ${stockData.stockName} with closedQty=0 but realizedP/L=${stockData.totalRealizedPL}`);
        // Set a minimum quantity of 1 for calculation purposes
        stockData.totalClosedQty = 1;
      }
      
      // Validate dates before calculating holding period
      if (!stockData.lastSellDate || !stockData.firstBuyDate) {
        console.warn(`⚠️  ${stockData.stockName}: Missing dates (lastSellDate: ${stockData.lastSellDate}, firstBuyDate: ${stockData.firstBuyDate})`);
        if (isOlaElectric) {
          console.error(`❌ Ola Electric missing dates!`);
        }
        // Use sellDate from last record if available
        if (!stockData.lastSellDate && stockData.firstBuyDate) {
          stockData.lastSellDate = stockData.firstBuyDate;
        }
        if (!stockData.firstBuyDate && stockData.lastSellDate) {
          stockData.firstBuyDate = stockData.lastSellDate;
        }
        if (!stockData.lastSellDate || !stockData.firstBuyDate) {
          if (isOlaElectric) {
            console.error(`❌ Cannot calculate Ola Electric - no valid dates`);
          }
          continue; // Skip if we still don't have valid dates
        }
      }
      
      if (isOlaElectric) {
        console.log(`✅ Processing Ola Electric aggregated data:`, {
          stockName: stockData.stockName,
          isin: stockData.isin || 'MISSING',
          totalClosedQty: stockData.totalClosedQty,
          totalRealizedPL: stockData.totalRealizedPL,
          lastSellDate: stockData.lastSellDate,
          firstBuyDate: stockData.firstBuyDate,
        });
      }
      
      // Calculate averages
      const avgSoldPrice = stockData.sellPrices.length > 0
        ? stockData.sellPrices.reduce((sum, p) => sum + p, 0) / stockData.sellPrices.length
        : stockData.totalClosedQty > 0 ? stockData.totalSellValue / stockData.totalClosedQty : 0;
      
      const avgBuyPrice = stockData.buyPrices.length > 0
        ? stockData.buyPrices.reduce((sum, p) => sum + p, 0) / stockData.buyPrices.length
        : stockData.totalClosedQty > 0 ? stockData.totalBuyValue / stockData.totalClosedQty : 0;
      
      // Get current price (will be 0 if not available)
      const currentPrice = stockData.isin ? await getCurrentStockPrice(stockData.isin) : 0;
      const currentValue = currentPrice > 0 ? currentPrice * stockData.totalClosedQty : 0;
      
      // Calculate metrics
      const totalInvested = stockData.totalBuyValue;
      const realizedPL = stockData.totalRealizedPL;
      const unrealizedPL = currentPrice > 0 ? currentValue - totalInvested : 0;
      const totalPL = realizedPL;
      const totalPLPercent = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;
      
      // Calculate holding period (ensure dates are valid)
      const daysDiff = Math.max(1, (stockData.lastSellDate.getTime() - stockData.firstBuyDate.getTime()) / (1000 * 60 * 60 * 24));
      const totalDays = Math.floor(daysDiff);
      
      let holdingPeriodYears = 0;
      let holdingPeriodMonths = 0;
      let holdingPeriodDays = 0;
      
      if (totalDays < 30) {
        holdingPeriodDays = totalDays;
      } else {
        const monthsDiff = Math.floor(totalDays / 30);
        holdingPeriodYears = Math.floor(monthsDiff / 12);
        holdingPeriodMonths = monthsDiff % 12;
      }
      
      // Calculate XIRR and CAGR
      const years = daysDiff / 365;
      let xirr = 0;
      if (years > 0 && totalInvested > 0) {
        const returnRatio = stockData.totalSellValue / totalInvested;
        xirr = (Math.pow(returnRatio, 1 / years) - 1) * 100;
      }
      
      const daysToToday = Math.max(1, (new Date().getTime() - stockData.firstBuyDate.getTime()) / (1000 * 60 * 60 * 24));
      const yearsToToday = daysToToday / 365;
      let cagr = 0;
      if (yearsToToday > 0 && totalInvested > 0 && currentValue > 0) {
        cagr = (Math.pow(currentValue / totalInvested, 1 / yearsToToday) - 1) * 100;
      }
      
      const finalStock = {
        stockName: stockData.stockName,
        sectorName: stockData.sectorName,
        isin: stockData.isin,
        qtySold: stockData.totalClosedQty,
        avgCost: avgBuyPrice,
        avgSoldPrice: avgSoldPrice,
        totalInvested: totalInvested,
        lastSoldDate: stockData.lastSellDate!,
        currentPrice: currentPrice,
        currentValue: currentValue,
        realizedPL: realizedPL,
        unrealizedPL: unrealizedPL,
        totalPL: totalPL,
        totalPLPercent: totalPLPercent,
        xirr: xirr,
        cagr: cagr,
        holdingPeriodYears: holdingPeriodYears,
        holdingPeriodMonths: holdingPeriodMonths,
        holdingPeriodDays: holdingPeriodDays,
      };
      
      realizedStocksData.push(finalStock);
      
      if (isOlaElectric) {
        console.log(`✅✅✅ Ola Electric FINAL entry added to realized stocks:`, {
          stockName: finalStock.stockName,
          isin: finalStock.isin,
          qtySold: finalStock.qtySold,
          realizedPL: finalStock.realizedPL,
          lastSoldDate: finalStock.lastSoldDate,
          currentPrice: finalStock.currentPrice,
          currentValue: finalStock.currentValue,
        });
      }
    }
    
    // Sort by last sold date (most recent first)
    const sorted = realizedStocksData.sort((a, b) => {
      const aTime = a.lastSoldDate instanceof Date ? a.lastSoldDate.getTime() : new Date(a.lastSoldDate).getTime();
      const bTime = b.lastSoldDate instanceof Date ? b.lastSoldDate.getTime() : new Date(b.lastSoldDate).getTime();
      return bTime - aTime;
    });
    
    // Final check for Ola Electric
    const finalOlaElectric = sorted.find((s: any) => 
      s.stockName?.toLowerCase().includes('ola electric') ||
      normalizeIsin(s.isin) === 'INEOLXG01040' ||
      normalizeIsin(s.isin) === 'INE0LXG01040'
    );
    if (finalOlaElectric) {
      console.log(`calculateRealizedStocksFromPL: ✅✅✅ Ola Electric confirmed in FINAL sorted realized stocks array at position ${sorted.indexOf(finalOlaElectric) + 1} of ${sorted.length}`);
      console.log(`calculateRealizedStocksFromPL: Ola Electric details:`, {
        stockName: finalOlaElectric.stockName,
        isin: finalOlaElectric.isin,
        qtySold: finalOlaElectric.qtySold,
        realizedPL: finalOlaElectric.realizedPL,
      });
    } else {
      console.error(`calculateRealizedStocksFromPL: ❌❌❌ Ola Electric NOT in final sorted realized stocks array! Total: ${sorted.length} stocks`);
      console.error(`calculateRealizedStocksFromPL: Ola Electric records in PL collection: ${olaElectricInPL.length}`);
      console.error(`calculateRealizedStocksFromPL: Stock map entries: ${stockMap.size}`);
      
      // Check what happened to Ola Electric
      const olaInStockMap = Array.from(stockMap.entries()).find(([key, data]) => 
        data.stockName.toLowerCase().includes('ola electric') ||
        normalizeIsin(data.isin) === 'INEOLXG01040' ||
        normalizeIsin(data.isin) === 'INE0LXG01040'
      );
      if (olaInStockMap) {
        console.error(`calculateRealizedStocksFromPL: ⚠️  Ola Electric was in stockMap but not in final array!`);
        console.error(`calculateRealizedStocksFromPL: StockMap data:`, olaInStockMap[1]);
        
        // CRITICAL: Add Ola Electric back if it's in stockMap but missing from result
        console.error(`calculateRealizedStocksFromPL: 🔴🔴🔴 Adding back Ola Electric from stockMap!`);
        const olaStockData = olaInStockMap[1];
        
        // Calculate metrics for Ola Electric
        const totalInvested = olaStockData.totalBuyValue || 0;
        const realizedPL = olaStockData.totalRealizedPL || 0;
        const avgBuyPrice = olaStockData.buyPrices.length > 0 
          ? olaStockData.buyPrices.reduce((sum: number, p: number) => sum + p, 0) / olaStockData.buyPrices.length
          : (totalInvested / (olaStockData.totalClosedQty || 1));
        const avgSoldPrice = olaStockData.sellPrices.length > 0
          ? olaStockData.sellPrices.reduce((sum: number, p: number) => sum + p, 0) / olaStockData.sellPrices.length
          : (olaStockData.totalSellValue / (olaStockData.totalClosedQty || 1));
        
        const currentPrice = await getCurrentStockPrice(olaStockData.isin);
        const currentValue = currentPrice > 0 ? (olaStockData.totalClosedQty * currentPrice) : 0;
        const unrealizedPL = currentValue - totalInvested;
        const totalPL = realizedPL + unrealizedPL;
        const totalPLPercent = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;
        
        // Calculate holding period
        let holdingPeriodYears = 0;
        let holdingPeriodMonths = 0;
        let holdingPeriodDays = 0;
        if (olaStockData.lastSellDate && olaStockData.firstBuyDate) {
          const daysDiff = Math.floor((olaStockData.lastSellDate.getTime() - olaStockData.firstBuyDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysDiff < 30) {
            holdingPeriodDays = daysDiff;
          } else {
            const monthsDiff = Math.floor(daysDiff / 30);
            holdingPeriodYears = Math.floor(monthsDiff / 12);
            holdingPeriodMonths = monthsDiff % 12;
          }
        }
        
        const olaFinalStock = {
          stockName: olaStockData.stockName,
          sectorName: olaStockData.sectorName,
          isin: olaStockData.isin,
          qtySold: olaStockData.totalClosedQty || 1,
          avgCost: avgBuyPrice,
          avgSoldPrice: avgSoldPrice,
          totalInvested: totalInvested,
          lastSoldDate: olaStockData.lastSellDate || new Date(),
          currentPrice: currentPrice,
          currentValue: currentValue,
          realizedPL: realizedPL,
          unrealizedPL: unrealizedPL,
          totalPL: totalPL,
          totalPLPercent: totalPLPercent,
          xirr: 0,
          cagr: 0,
          holdingPeriodYears: holdingPeriodYears,
          holdingPeriodMonths: holdingPeriodMonths,
          holdingPeriodDays: holdingPeriodDays,
        };
        
        sorted.push(olaFinalStock);
        console.error(`calculateRealizedStocksFromPL: ✅✅✅ Ola Electric added back to realized stocks!`);
      } else {
        console.error(`calculateRealizedStocksFromPL: ⚠️  Ola Electric was NOT added to stockMap at all!`);
      }
    }
    
    // CRITICAL FINAL VERIFICATION: Ensure ALL stocks from stockMap are in the result
    console.log(`calculateRealizedStocksFromPL: Final verification - StockMap has ${stockMap.size} entries, Result has ${sorted.length} entries`);
    if (stockMap.size !== sorted.length) {
      console.error(`calculateRealizedStocksFromPL: ⚠️  MISMATCH! Some stocks in stockMap are missing from result!`);
      
      // Find and add ALL missing stocks
      const missingStocksCount = stockMap.size - sorted.length;
      console.error(`calculateRealizedStocksFromPL: Missing ${missingStocksCount} stocks - adding them back...`);
      
      for (const [key, stockData] of stockMap.entries()) {
        const existsInResult = sorted.find((s: any) => {
          const sKey = normalizeIsin(s.isin) || s.stockName?.toLowerCase().trim();
          return sKey === key;
        });
        
        if (!existsInResult) {
          console.error(`calculateRealizedStocksFromPL: 🔴 Adding missing stock: ${stockData.stockName} (key: ${key})`);
          
          // Calculate basic metrics
          const totalInvested = stockData.totalBuyValue || 0;
          const realizedPL = stockData.totalRealizedPL || 0;
          const avgBuyPrice = stockData.buyPrices.length > 0 
            ? stockData.buyPrices.reduce((sum: number, p: number) => sum + p, 0) / stockData.buyPrices.length
            : (totalInvested / (stockData.totalClosedQty || 1));
          const avgSoldPrice = stockData.sellPrices.length > 0
            ? stockData.sellPrices.reduce((sum: number, p: number) => sum + p, 0) / stockData.sellPrices.length
            : (stockData.totalSellValue / (stockData.totalClosedQty || 1));
          
          const currentPrice = await getCurrentStockPrice(stockData.isin);
          const currentValue = currentPrice > 0 ? (stockData.totalClosedQty * currentPrice) : 0;
          const unrealizedPL = currentValue - totalInvested;
          const totalPL = realizedPL + unrealizedPL;
          const totalPLPercent = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;
          
          // Calculate holding period
          let holdingPeriodYears = 0;
          let holdingPeriodMonths = 0;
          let holdingPeriodDays = 0;
          if (stockData.lastSellDate && stockData.firstBuyDate) {
            const daysDiff = Math.floor((stockData.lastSellDate.getTime() - stockData.firstBuyDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysDiff < 30) {
              holdingPeriodDays = daysDiff;
            } else {
              const monthsDiff = Math.floor(daysDiff / 30);
              holdingPeriodYears = Math.floor(monthsDiff / 12);
              holdingPeriodMonths = monthsDiff % 12;
            }
          }
          
          const missingStock = {
            stockName: stockData.stockName,
            sectorName: stockData.sectorName,
            isin: stockData.isin,
            qtySold: stockData.totalClosedQty || 1,
            avgCost: avgBuyPrice,
            avgSoldPrice: avgSoldPrice,
            totalInvested: totalInvested,
            lastSoldDate: stockData.lastSellDate || new Date(),
            currentPrice: currentPrice,
            currentValue: currentValue,
            realizedPL: realizedPL,
            unrealizedPL: unrealizedPL,
            totalPL: totalPL,
            totalPLPercent: totalPLPercent,
            xirr: 0,
            cagr: 0,
            holdingPeriodYears: holdingPeriodYears,
            holdingPeriodMonths: holdingPeriodMonths,
            holdingPeriodDays: holdingPeriodDays,
          };
          
          sorted.push(missingStock);
          if (stockData.stockName.toLowerCase().includes('ola electric')) {
            console.error(`calculateRealizedStocksFromPL: ✅✅✅ Ola Electric added back!`);
          }
        }
      }
      
      // Re-sort after adding missing stocks
      sorted.sort((a, b) => {
        const aTime = a.lastSoldDate instanceof Date ? a.lastSoldDate.getTime() : new Date(a.lastSoldDate).getTime();
        const bTime = b.lastSoldDate instanceof Date ? b.lastSoldDate.getTime() : new Date(b.lastSoldDate).getTime();
        return bTime - aTime;
      });
      
      console.error(`calculateRealizedStocksFromPL: ✅ After adding missing stocks: ${sorted.length} total (was ${sorted.length - missingStocksCount})`);
    }
    
    return sorted;
  } catch (error: any) {
    console.error('Error in calculateRealizedStocksFromPL:', error);
    console.error('Error stack:', error?.stack);
    return [];
  }
}

/**
 * Get current stock price for an ISIN
 * Returns price from database only - doesn't fetch from API to avoid blocking
 */
async function getCurrentStockPrice(isin: string): Promise<number> {
  try {
    // connectDB is already called at the top level, no need to call again
    const StockData = (await import('@/models/StockData')).default;
    
    // Get the most recent stock price from historical data only
    // Don't fetch from API here to avoid blocking the dashboard load
    const latestData: any = await StockData.findOne({ isin })
      .sort({ date: -1 })
      .lean();
    
    if (latestData && latestData.close) {
      return latestData.close;
    }
    
    // Return 0 if not found - prices can be fetched later via the refresh button
    return 0;
  } catch (error) {
    console.error(`Error getting current price for ${isin}:`, error);
    return 0;
  }
}

