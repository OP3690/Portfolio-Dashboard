import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Holding from '@/models/Holding';
import StockMaster from '@/models/StockMaster';
import StockData from '@/models/StockData';

export const dynamic = 'force-dynamic';

/**
 * Calculate PE Intelligence metrics for holdings
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    
    const searchParams = request.nextUrl.searchParams;
    const clientId = searchParams.get('clientId') || '994826';
    
    // Get all holdings
    const holdings = await Holding.find({ clientId }).lean();
    
    if (!holdings || holdings.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        message: 'No holdings found'
      });
    }
    
    // Get unique ISINs
    const isins = [...new Set(holdings.map((h: any) => h.isin).filter(Boolean))];
    
    // Get latest prices for all holdings
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterdayEvening = new Date(today);
    yesterdayEvening.setDate(yesterdayEvening.getDate() - 1);
    yesterdayEvening.setUTCHours(18, 30, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setUTCHours(23, 59, 59, 999);
    
    // Fetch latest prices
    const latestPrices = await StockData.aggregate([
      {
        $match: {
          isin: { $in: isins },
          date: { $gte: yesterdayEvening, $lte: todayEnd },
          close: { $gt: 0 }
        }
      },
      { $sort: { date: -1, _id: -1 } },
      {
        $group: {
          _id: '$isin',
          latestPrice: { $first: '$close' },
          latestDate: { $first: '$date' }
        }
      }
    ]).exec();
    
    const priceMap = new Map<string, number>();
    latestPrices.forEach((p: any) => {
      priceMap.set(p._id, p.latestPrice);
    });
    
    // Fill missing prices with latest available
    const missingPrices = isins.filter(isin => !priceMap.has(isin));
    if (missingPrices.length > 0) {
      const fallbackPrices = await StockData.aggregate([
        { $match: { isin: { $in: missingPrices } } },
        { $sort: { date: -1, _id: -1 } },
        {
          $group: {
            _id: '$isin',
            latestPrice: { $first: '$close' }
          }
        }
      ]).exec();
      
      fallbackPrices.forEach((p: any) => {
        if (!priceMap.has(p._id)) {
          priceMap.set(p._id, p.latestPrice);
        }
      });
    }
    
    // Get StockMaster data for all holdings
    const stockMasters = await StockMaster.find({ isin: { $in: isins } })
      .select('isin stockName symbol exchange sector industry pdSectorPe pdSymbolPe pdSectorInd isFNOSec')
      .lean();
    
    const stockMasterMap = new Map<string, any>();
    stockMasters.forEach((sm: any) => {
      stockMasterMap.set(sm.isin, sm);
    });
    
    // Group by sector for peer analysis
    const sectorMap = new Map<string, any[]>();
    stockMasters.forEach((sm: any) => {
      const sector = sm.sector || sm.pdSectorInd || 'Unknown';
      if (!sectorMap.has(sector)) {
        sectorMap.set(sector, []);
      }
      sectorMap.get(sector)!.push(sm);
    });
    
    // Calculate PE metrics for each holding
    const peIntelligence = holdings.map((holding: any) => {
      const isin = holding.isin;
      const stockMaster = stockMasterMap.get(isin);
      const currentPrice = priceMap.get(isin) || 0;
      
      if (!stockMaster) {
        return null;
      }
      
      const stockPE = stockMaster.pdSymbolPe;
      const sectorPE = stockMaster.pdSectorPe;
      const sector = stockMaster.sector || stockMaster.pdSectorInd || 'Unknown';
      
      // Calculate metrics
      let relativeValuation: number | null = null;
      let valuationGap: number | null = null;
      let peSignal = 'Neutral';
      let peColor = 'gray';
      let eps = null;
      let pegRatio = null;
      
      if (stockPE && sectorPE && stockPE > 0 && sectorPE > 0) {
        // Relative Valuation % - always calculate when both PE values exist
        relativeValuation = ((stockPE - sectorPE) / sectorPE) * 100;
        valuationGap = stockPE - sectorPE;
        
        // Calculate EPS = Price / PE
        if (currentPrice > 0 && stockPE > 0) {
          eps = currentPrice / stockPE;
        }
        
        // Determine signal based on relative valuation
        if (relativeValuation < -10) {
          peSignal = 'Undervalued';
          peColor = 'green';
        } else if (relativeValuation > 10) {
          peSignal = 'Overvalued';
          peColor = 'red';
        } else {
          peSignal = 'Fairly Valued';
          peColor = 'yellow';
        }
      }
      
      // Get sector peers (top 3 by market cap or similar metric)
      const sectorPeers = sectorMap.get(sector) || [];
      const peers = sectorPeers
        .filter((sm: any) => sm.isin !== isin)
        .slice(0, 3)
        .map((sm: any) => sm.stockName || sm.symbol || 'Unknown');
      
      // Calculate 6-month PE volatility (simplified - would need historical PE data)
      // For now, we'll use a placeholder
      const peVolatility = null;
      
      // Calculate expected upside (simplified)
      // If stock PE is less than or equal to sector PE, calculate potential upside
      // If stock PE equals sector PE, expected upside is 0% (fairly valued, no upside)
      let expectedUpside: number | null = null;
      let targetPrice: number | null = null;
      if (stockPE && sectorPE && currentPrice > 0 && eps) {
        if (stockPE <= sectorPE) {
          targetPrice = eps * sectorPE;
          expectedUpside = ((targetPrice - currentPrice) / currentPrice) * 100;
          // If stock PE equals sector PE, expected upside will be 0% (or very close to 0 due to rounding)
          // This is correct - no upside when already at sector PE
        }
      }
      
      return {
        stockName: holding.stockName || stockMaster.stockName || 'Unknown',
        isin: isin,
        sector: sector,
        currentPrice: currentPrice,
        stockPE: stockPE || null,
        sectorPE: sectorPE || null,
        relativeValuation: relativeValuation !== null ? relativeValuation : null,
        valuationGap: valuationGap !== null ? valuationGap : null,
        eps: eps,
        pegRatio: pegRatio,
        peSignal: peSignal,
        peColor: peColor,
        peVolatility: peVolatility,
        expectedUpside: expectedUpside !== null ? expectedUpside : null,
        targetPrice: targetPrice,
        sectorPeers: peers,
        pdSectorInd: stockMaster.pdSectorInd || null,
        industry: stockMaster.industry || null,
        isFNOSec: stockMaster.isFNOSec || false,
      };
    }).filter((item: any) => item !== null && item.stockPE !== null && item.sectorPE !== null);
    
    // Calculate sector-level summary
    const sectorSummary = Array.from(sectorMap.entries()).map(([sector, stocks]) => {
      const sectorHoldings = peIntelligence.filter((item: any) => item.sector === sector);
      if (sectorHoldings.length === 0) return null;
      
      const avgSectorPE = sectorHoldings.reduce((sum, item) => sum + ((item?.sectorPE || 0) as number), 0) / sectorHoldings.length;
      const avgGap = sectorHoldings.reduce((sum, item) => sum + ((item?.relativeValuation || 0) as number), 0) / sectorHoldings.length;
      
      const undervaluedStocks = sectorHoldings.filter((item: any) => item.peSignal === 'Undervalued');
      const overvaluedStocks = sectorHoldings.filter((item: any) => item.peSignal === 'Overvalued');
      
      const topUndervalued = undervaluedStocks.length > 0 
        ? undervaluedStocks.sort((a: any, b: any) => ((a?.relativeValuation || 0) as number) - ((b?.relativeValuation || 0) as number))[0]
        : null;
      const topOvervalued = overvaluedStocks.length > 0 
        ? overvaluedStocks.sort((a: any, b: any) => ((b?.relativeValuation || 0) as number) - ((a?.relativeValuation || 0) as number))[0]
        : null;
      
      return {
        sector: sector,
        avgSectorPE: avgSectorPE,
        avgGap: avgGap,
        holdingsCount: sectorHoldings.length,
        topUndervalued: topUndervalued?.stockName || null,
        topOvervalued: topOvervalued?.stockName || null,
        observation: generateSectorObservation(sector, avgGap, topUndervalued, topOvervalued)
      };
    }).filter((item: any) => item !== null);
    
    // Sort by relative valuation (most undervalued first)
    peIntelligence.sort((a: any, b: any) => (a.relativeValuation || 0) - (b.relativeValuation || 0));
    
    return NextResponse.json({
      success: true,
      data: peIntelligence,
      sectorSummary: sectorSummary,
      totalHoldings: peIntelligence.length
    });
    
  } catch (error: any) {
    console.error('Error fetching PE intelligence:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch PE intelligence data'
      },
      { status: 500 }
    );
  }
}

/**
 * Generate AI observation for sector
 */
function generateSectorObservation(
  sector: string,
  avgGap: number,
  topUndervalued: any,
  topOvervalued: any
): string {
  if (avgGap < -10) {
    return `Sector appears undervalued. ${topUndervalued ? topUndervalued.stockName : 'Some stocks'} showing strong value opportunity.`;
  } else if (avgGap > 10) {
    return `Sector trading at premium. ${topOvervalued ? topOvervalued.stockName : 'Some stocks'} may face correction risk.`;
  } else {
    return `Sector trading at fair value. Mixed opportunities with selective picks.`;
  }
}

