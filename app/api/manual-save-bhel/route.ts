import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Holding from '@/models/Holding';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    
    const body = await request.json();
    const clientId = body.clientId || '994826';
    
    // Sample BHEL data based on what we saw in the logs
    const bhelData = {
      stockName: 'B H E L',
      sectorName: 'Capital Goods - Electrical Equipment',
      isin: 'INE257A01026',
      portfolioPercentage: 8.14,
      openQty: 5250,
      marketPrice: 0, // Will use avgCost if not provided
      marketValue: 0, // Will calculate
      investmentAmount: body.investmentAmount || 0,
      avgCost: body.avgCost || 0,
      profitLossTillDate: 0,
      profitLossTillDatePercent: 0,
      clientId,
      clientName: body.clientName || 'Default Client',
      asOnDate: new Date(),
      lastUpdated: new Date(),
    };
    
    // Ensure required fields have values
    if (!bhelData.marketPrice && bhelData.avgCost > 0) {
      bhelData.marketPrice = bhelData.avgCost;
    }
    if (!bhelData.marketValue && bhelData.marketPrice > 0 && bhelData.openQty > 0) {
      bhelData.marketValue = bhelData.marketPrice * bhelData.openQty;
    }
    
    console.log('Manual save - Attempting to save BHEL:', bhelData);
    
    const result = await Holding.findOneAndUpdate(
      { clientId, isin: 'INE257A01026' },
      bhelData,
      { upsert: true, new: true, runValidators: true }
    );
    
    if (result) {
      console.log('Manual save - BHEL saved successfully:', result);
      
      // Verify it was saved
      await new Promise(resolve => setTimeout(resolve, 300));
      const verify = await Holding.findOne({ clientId, isin: 'INE257A01026' }).lean();
      
      if (verify) {
        return NextResponse.json({
          success: true,
          message: 'BHEL saved and verified successfully',
          data: verify,
        });
      } else {
        return NextResponse.json({
          success: false,
          message: 'BHEL save returned result but verification query failed',
          saved: result,
        }, { status: 500 });
      }
    } else {
      return NextResponse.json({
        success: false,
        message: 'BHEL save returned null',
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Manual save - Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    }, { status: 500 });
  }
}

