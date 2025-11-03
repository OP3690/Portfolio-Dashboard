import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import StockData from '@/models/StockData';
import { parseISO, format } from 'date-fns';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const isin = searchParams.get('isin');
    const fromDateStr = searchParams.get('fromDate');
    const toDateStr = searchParams.get('toDate');

    if (!isin) {
      return NextResponse.json(
        { error: 'ISIN is required' },
        { status: 400 }
      );
    }

    let query: any = { isin };

    if (fromDateStr && toDateStr) {
      const fromDate = new Date(fromDateStr);
      const toDate = new Date(toDateStr);
      // Set to end of day for toDate
      toDate.setHours(23, 59, 59, 999);
      
      query.date = {
        $gte: fromDate,
        $lte: toDate,
      };
    }

    const stockData = await StockData.find(query)
      .sort({ date: 1 })
      .lean();

    // Format the data for frontend
    const ohlcData = stockData.map((data: any) => ({
      date: format(new Date(data.date), 'yyyy-MM-dd'),
      open: data.open || 0,
      high: data.high || 0,
      low: data.low || 0,
      close: data.close || 0,
      volume: data.volume || 0,
      pe: data.pe || null,
    }));

    return NextResponse.json({
      success: true,
      ohlcData,
      count: ohlcData.length,
    });
  } catch (error: any) {
    console.error('Error fetching OHLC data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch OHLC data', message: error.message },
      { status: 500 }
    );
  }
}

