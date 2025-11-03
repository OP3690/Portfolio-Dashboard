import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import RealizedProfitLoss from '@/models/RealizedProfitLoss';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId') || '994826';
    
    // Get all realized P&L records
    const allRecords = await RealizedProfitLoss.find({ clientId }).lean();
    
    // Check for Ola Electric specifically
    const olaElectricRecords = allRecords.filter((r: any) => 
      String(r.stockName || '').toLowerCase().includes('ola electric')
    );
    
    // Group by stock name
    const stockGroups: { [key: string]: any[] } = {};
    allRecords.forEach((r: any) => {
      const stockName = String(r.stockName || '').trim().toLowerCase();
      if (!stockGroups[stockName]) {
        stockGroups[stockName] = [];
      }
      stockGroups[stockName].push(r);
    });
    
    // Get unique stock names
    const uniqueStocks = Object.keys(stockGroups).sort();
    
    return NextResponse.json({
      success: true,
      totalRecords: allRecords.length,
      uniqueStocks: uniqueStocks.length,
      olaElectricRecords: olaElectricRecords.length,
      olaElectricDetails: olaElectricRecords.map((r: any) => ({
        stockName: r.stockName,
        isin: r.isin || 'MISSING',
        closedQty: r.closedQty,
        sellDate: r.sellDate,
        buyDate: r.buyDate,
        realizedProfitLoss: r.realizedProfitLoss,
      })),
      allUniqueStocks: uniqueStocks.slice(0, 50), // First 50 for brevity
      stockGroups: Object.fromEntries(
        Object.entries(stockGroups).slice(0, 10).map(([name, records]) => [
          name,
          {
            count: records.length,
            totalClosedQty: records.reduce((sum: number, r: any) => sum + (Number(r.closedQty) || 0), 0),
            totalRealizedPL: records.reduce((sum: number, r: any) => sum + (Number(r.realizedProfitLoss) || 0), 0),
          }
        ])
      ),
    });
  } catch (error: any) {
    console.error('Debug realized error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}

