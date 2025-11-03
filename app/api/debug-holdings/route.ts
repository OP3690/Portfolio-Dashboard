import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Holding from '@/models/Holding';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    
    const searchParams = request.nextUrl.searchParams;
    const clientId = searchParams.get('clientId') || '994826';
    
    // Get raw count first
    const totalCount = await Holding.countDocuments({ clientId });
    console.log(`Debug: Raw count from database: ${totalCount}`);
    
    const holdings = await Holding.find({ clientId }).lean();
    console.log(`Debug: Fetched ${holdings.length} holdings via find().lean()`);
    
    // Direct query for BHEL
    const bhelDirect = await Holding.findOne({ clientId, isin: 'INE257A01026' }).lean();
    console.log(`Debug: Direct BHEL query: ${bhelDirect ? 'FOUND' : 'NOT FOUND'}`);
    if (bhelDirect) {
      console.log(`Debug: BHEL details:`, bhelDirect.stockName, bhelDirect.isin, `Qty: ${bhelDirect.openQty}`);
    }
    
    // Check specifically for BHEL
    const bhel = holdings.find(h => 
      h.isin === 'INE257A01026' || 
      (h.stockName && h.stockName.toLowerCase().includes('bhel'))
    );
    
    // Check for Va Tech Wabag
    const vatech = holdings.find(h => 
      h.isin === 'INE956G01038' || 
      (h.stockName && h.stockName.toLowerCase().includes('va tech'))
    );
    
    return NextResponse.json({
      success: true,
      totalHoldings: holdings.length,
      clientId,
      holdings: holdings.map((h: any, idx: number) => ({
        index: idx + 1,
        stockName: h.stockName,
        isin: h.isin,
        openQty: h.openQty,
        sectorName: h.sectorName,
        marketValue: h.marketValue,
      })),
      bhel: bhel ? {
        found: true,
        stockName: bhel.stockName,
        isin: bhel.isin,
        openQty: bhel.openQty,
        sectorName: (bhel as any).sectorName,
        fullData: bhel,
      } : {
        found: false,
        message: 'BHEL (INE257A01026) not found in database',
        directQuery: bhelDirect ? {
          found: true,
          stockName: bhelDirect.stockName,
          isin: bhelDirect.isin,
          clientId: bhelDirect.clientId,
          note: 'Found via direct query but not in array - query issue'
        } : {
          found: false,
          note: 'Not found via direct query either - truly missing from database'
        },
        rawCount: totalCount,
        arrayLength: holdings.length,
      },
      vaTechWabag: vatech ? {
        found: true,
        stockName: vatech.stockName,
        isin: vatech.isin,
        openQty: vatech.openQty,
        sectorName: (vatech as any).sectorName,
      } : {
        found: false,
        message: 'Va Tech Wabag (INE956G01038) not found in database'
      },
      isins: holdings.map((h: any) => h.isin).sort(),
    });
  } catch (error: any) {
    console.error('Error in debug-holdings:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}

