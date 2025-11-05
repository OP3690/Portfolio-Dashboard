import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import CorporateInfo from '@/models/CorporateInfo';
import StockMaster from '@/models/StockMaster';
import { subDays, differenceInDays } from 'date-fns';

export const dynamic = 'force-dynamic';

/**
 * GET /api/promoter-holding-changes?type=increasing|decreasing&days=7|15|30
 * Get stocks where promoter holding is increasing or decreasing in the last N days
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'increasing'; // 'increasing' or 'decreasing'
    const daysParam = searchParams.get('days') || '30';
    const days = parseInt(daysParam);

    if (!['increasing', 'decreasing'].includes(type)) {
      return NextResponse.json(
        { success: false, error: 'Type must be "increasing" or "decreasing"' },
        { status: 400 }
      );
    }

    if (![7, 15, 30].includes(days)) {
      return NextResponse.json(
        { success: false, error: 'Days must be 7, 15, or 30' },
        { status: 400 }
      );
    }

    const cutoffDate = subDays(new Date(), days);
    cutoffDate.setHours(0, 0, 0, 0);

    // Get all corporate info with shareholding patterns
    // Also get StockMaster data to ensure ISINs are normalized correctly
    const allCorporateInfo = await CorporateInfo.find({
      shareholdingPatterns: { $exists: true, $ne: [] }
    })
      .select('isin symbol stockName shareholdingPatterns')
      .lean();
    
    // Create a map of CorporateInfo ISINs to StockMaster ISINs for normalization
    const StockMaster = (await import('@/models/StockMaster')).default;
    const corporateIsins = allCorporateInfo.map((c: any) => (c.isin || '').toUpperCase().trim()).filter(Boolean);
    const stockMasters = await StockMaster.find({ 
      isin: { $in: corporateIsins }
    })
      .select('isin')
      .lean();
    
    const isinNormalizationMap = new Map<string, string>();
    stockMasters.forEach((sm: any) => {
      const normalizedIsin = (sm.isin || '').toUpperCase().trim();
      isinNormalizationMap.set(normalizedIsin, normalizedIsin);
    });

    const changes: Array<{
      isin: string;
      symbol: string;
      stockName: string;
      currentHolding: number;
      previousHolding: number;
      change: number;
      changePercent: number;
      currentDate: Date;
      previousDate: Date;
      daysAgo: number;
    }> = [];

    for (const corpInfo of allCorporateInfo) {
      const patterns = (corpInfo as any).shareholdingPatterns || [];
      
      if (patterns.length < 2) continue; // Need at least 2 data points to compare

      // Sort by periodEnded descending (most recent first)
      const sortedPatterns = [...patterns].sort((a: any, b: any) => {
        const dateA = new Date(a.periodEnded).getTime();
        const dateB = new Date(b.periodEnded).getTime();
        return dateB - dateA;
      });

      const currentPattern = sortedPatterns[0];
      const currentDate = new Date(currentPattern.periodEnded);
      
      // Find the pattern before the cutoff date (previous period)
      let previousPattern = null;
      let previousDate = null;
      
      for (let i = 1; i < sortedPatterns.length; i++) {
        const patternDate = new Date(sortedPatterns[i].periodEnded);
        if (patternDate < cutoffDate || i === sortedPatterns.length - 1) {
          previousPattern = sortedPatterns[i];
          previousDate = patternDate;
          break;
        }
      }

      if (!previousPattern || !currentPattern.promoterAndPromoterGroup || !previousPattern.promoterAndPromoterGroup) {
        continue;
      }

      // Normalize holdings: if value is less than 1 and total is around 1, multiply by 100
      // This fixes cases where data is stored as 0.57 instead of 57
      let currentHolding = currentPattern.promoterAndPromoterGroup;
      let previousHolding = previousPattern.promoterAndPromoterGroup;
      const currentTotal = currentPattern.total || 0;
      const previousTotal = previousPattern.total || 0;
      
      // Check if current data appears to be in decimal format (0.57 instead of 57)
      // If total is around 1 (or less than 2) and current holding is less than 1, it's likely decimal format
      if (currentTotal > 0 && currentTotal < 2 && currentHolding < 1 && currentHolding > 0) {
        currentHolding = currentHolding * 100;
      }
      if (previousTotal > 0 && previousTotal < 2 && previousHolding < 1 && previousHolding > 0) {
        previousHolding = previousHolding * 100;
      }
      
      // Additional validation: if current holding is < 1% but previous was > 50%, and change is > 99%, 
      // it's likely a data error - multiply current by 100
      if (currentHolding < 1 && previousHolding > 50) {
        const testChange = ((currentHolding * 100) - previousHolding) / previousHolding;
        if (Math.abs(testChange) < 0.1) { // If multiplying by 100 makes change < 10%, it's likely the fix
          currentHolding = currentHolding * 100;
        }
      }
      
      const change = currentHolding - previousHolding;
      const changePercent = previousHolding > 0 ? (change / previousHolding) * 100 : 0;
      const daysAgo = differenceInDays(new Date(), currentDate);

      // Normalize ISIN (uppercase, trim)
      let normalizedIsin = ((corpInfo as any).isin || '').toUpperCase().trim();
      if (!normalizedIsin) continue; // Skip if no ISIN
      
      // Use StockMaster ISIN if available (to ensure correct format matching StockData)
      const stockMasterIsin = isinNormalizationMap.get(normalizedIsin);
      if (stockMasterIsin) {
        normalizedIsin = stockMasterIsin;
      }
      
      // Filter based on type
      if (type === 'increasing' && change > 0) {
        changes.push({
          isin: normalizedIsin,
          symbol: (corpInfo as any).symbol || '',
          stockName: (corpInfo as any).stockName || 'Unknown',
          currentHolding,
          previousHolding,
          change,
          changePercent,
          currentDate,
          previousDate: previousDate!,
          daysAgo,
        });
      } else if (type === 'decreasing' && change < 0) {
        changes.push({
          isin: normalizedIsin,
          symbol: (corpInfo as any).symbol || '',
          stockName: (corpInfo as any).stockName || 'Unknown',
          currentHolding,
          previousHolding,
          change,
          changePercent,
          currentDate,
          previousDate: previousDate!,
          daysAgo,
        });
      }
    }

    // Sort by absolute change percent (largest changes first)
    changes.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));

    // Get current prices for these stocks (ISINs are already normalized)
    const isins = changes.map(c => c.isin);
    const StockData = (await import('@/models/StockData')).default;
    
    const latestPricesMap = new Map<string, number | null>();
    
    // Use individual queries to avoid memory limits (similar to financial-results-calendar)
    const PRICE_BATCH_SIZE = 100;
    for (let i = 0; i < isins.length; i += PRICE_BATCH_SIZE) {
      const batchIsins = isins.slice(i, i + PRICE_BATCH_SIZE);
      
      // Use parallel individual queries instead of aggregation to avoid memory limits
      // Use the EXACT same logic as financial-results-calendar for consistency
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

    // Enhance results with current prices
    const enrichedChanges = changes.map(change => ({
      ...change,
      currentPrice: latestPricesMap.get(change.isin) || null,
    }));

    // Pagination
    const pageParam = searchParams.get('page');
    const limitParam = searchParams.get('limit');
    const page = pageParam ? parseInt(pageParam) : 1;
    const limit = limitParam ? parseInt(limitParam) : 10;
    const totalCount = enrichedChanges.length;
    const totalPages = Math.ceil(totalCount / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedChanges = enrichedChanges.slice(startIndex, endIndex);

    return NextResponse.json({
      success: true,
      type,
      days,
      count: totalCount,
      page,
      limit,
      totalPages,
      results: paginatedChanges, // Also include as 'results' for consistency
      changes: paginatedChanges, // Keep 'changes' for backward compatibility
    });
  } catch (error: any) {
    console.error('Error in promoter-holding-changes API:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

