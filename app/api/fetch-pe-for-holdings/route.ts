import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Holding from '@/models/Holding';
import StockMaster from '@/models/StockMaster';
import { fetchNSEDailyData } from '@/lib/nseDailyDataService';
import mongoose from 'mongoose';

export const dynamic = 'force-dynamic';

/**
 * Fetch and store PE data specifically for holdings
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    
    const searchParams = request.nextUrl.searchParams;
    const clientId = searchParams.get('clientId') || '994826';
    
    // Get all holdings
    const holdings = await Holding.find({ clientId }).select('isin stockName').lean();
    
    if (!holdings || holdings.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No holdings found'
      });
    }
    
    // Get StockMaster records for holdings
    const isins = holdings.map((h: any) => h.isin).filter(Boolean);
    const stockMasters = await StockMaster.find({ isin: { $in: isins } })
      .select('isin symbol exchange')
      .lean();
    
    const stockMasterMap = new Map<string, any>();
    stockMasters.forEach((sm: any) => {
      stockMasterMap.set(sm.isin, sm);
    });
    
    let processed = 0;
    let failed = 0;
    const errors: string[] = [];
    const updated: string[] = [];
    
    // Process each holding
    for (const holding of holdings) {
      const isin = (holding as any).isin;
      const stockMaster = stockMasterMap.get(isin);
      
      if (!stockMaster || stockMaster.exchange !== 'NSE' || !stockMaster.symbol) {
        failed++;
        errors.push(`${(holding as any).stockName} (${isin}): Not an NSE stock or missing symbol`);
        continue;
      }
      
      try {
        // Fetch NSE data
        const nseData = await fetchNSEDailyData(stockMaster.symbol);
        
        if (!nseData) {
          failed++;
          errors.push(`${(holding as any).stockName} (${isin}): Failed to fetch NSE data`);
          continue;
        }
        
        // Update StockMaster if PE data exists
        const updateFields: any = {};
        
        if (nseData.pdSymbolPe !== undefined && nseData.pdSymbolPe !== null) {
          updateFields.pdSymbolPe = nseData.pdSymbolPe;
        }
        if (nseData.pdSectorPe !== undefined && nseData.pdSectorPe !== null) {
          updateFields.pdSectorPe = nseData.pdSectorPe;
        }
        if (nseData.pdSectorInd !== undefined && nseData.pdSectorInd !== null) {
          updateFields.pdSectorInd = nseData.pdSectorInd;
        }
        if (nseData.industry !== undefined && nseData.industry !== null) {
          updateFields.industry = nseData.industry;
        }
        if (nseData.isFNOSec !== undefined) {
          updateFields.isFNOSec = nseData.isFNOSec;
        }
        
        if (Object.keys(updateFields).length > 0) {
          updateFields.lastUpdated = new Date();
          
          // Use direct MongoDB update to ensure it works
          const connection = await connectDB();
          const dbInstance = connection.connection.db;
          if (!dbInstance) {
            console.error(`❌ Database instance not available for ${isin}`);
            continue;
          }
          
          const updateResult = await dbInstance.collection('stockmasters').updateOne(
            { isin },
            { $set: updateFields }
          );
          
          if (updateResult.modifiedCount > 0 || updateResult.matchedCount > 0) {
            updated.push(`${(holding as any).stockName}: PE=${nseData.pdSymbolPe || 'N/A'}, Sector PE=${nseData.pdSectorPe || 'N/A'}`);
            processed++;
          } else {
            failed++;
            errors.push(`${(holding as any).stockName} (${isin}): Update failed (no document matched)`);
          }
        } else {
          failed++;
          errors.push(`${(holding as any).stockName} (${isin}): No PE data in NSE response`);
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error: any) {
        failed++;
        errors.push(`${(holding as any).stockName} (${isin}): ${error.message || 'Unknown error'}`);
      }
    }
    
    return NextResponse.json({
      success: true,
      message: `Processed ${processed}/${holdings.length} holdings`,
      processed,
      failed,
      updated: updated.slice(0, 10), // Show first 10 updates
      errors: errors.slice(0, 10), // Show first 10 errors
    });
    
  } catch (error: any) {
    console.error('Error fetching PE for holdings:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch PE data for holdings'
      },
      { status: 500 }
    );
  }
}

