import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Holding from '@/models/Holding';

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();
    
    const searchParams = request.nextUrl.searchParams;
    const clientId = searchParams.get('clientId') || '994826';
    
    // Get from database
    const dbHoldings = await Holding.find({ clientId }).lean() as any[];
    const dbCount = await Holding.countDocuments({ clientId });
    
    // Normalize ISINs
    const normalizeIsin = (isin: string | null | undefined): string => {
      if (!isin) return '';
      return String(isin).trim().toUpperCase();
    };
    
    const normalizedDbHoldings = dbHoldings.map((h: any) => ({
      ...h,
      isin: normalizeIsin(h.isin),
    }));
    
    // Check for BHEL
    const bhel = normalizedDbHoldings.find(h => 
      h.isin === 'INE257A01026' || h.stockName?.toLowerCase().includes('bhel')
    );
    
    // Get all ISINs
    const allIsins = normalizedDbHoldings.map(h => h.isin).sort();
    
    return NextResponse.json({
      success: true,
      database: {
        totalCount: dbCount,
        holdingsCount: normalizedDbHoldings.length,
        bhelFound: !!bhel,
        bhelDetails: bhel ? {
          stockName: bhel.stockName,
          isin: bhel.isin,
          openQty: bhel.openQty,
          _id: bhel._id?.toString(),
        } : null,
        allIsins: allIsins,
        holdings: normalizedDbHoldings.map(h => ({
          stockName: h.stockName,
          isin: h.isin,
          openQty: h.openQty,
        })),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { 
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

